import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, runPgTransaction, resolveAdminPanelTenant } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureSchoolAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteCtx) {
  const userId = await ensureSchoolAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const { id: yearId } = await context.params;
  try {
    const body = await request.json();
    const { name, date_from, date_to } = body as {
      name?: string;
      date_from?: string;
      date_to?: string;
    };
    if (!name?.trim() || !date_from || !date_to) {
      return NextResponse.json({ message: "Brak nazwy lub zakresu dat" }, { status: 400 });
    }

    const result = await runPgTransaction(async (c) => {
      const cur = await c.query<{ active: boolean }>(
        tenant.role === "MANAGER"
          ? `SELECT active FROM school_years WHERE id = $1 AND school_id = $2 LIMIT 1`
          : `SELECT active FROM school_years WHERE id = $1 LIMIT 1`,
        tenant.role === "MANAGER" ? [yearId, tenant.tenantSchoolId] : [yearId]
      );
      if (!cur.rows[0]) return { kind: "not_found" as const };
      if (cur.rows[0].active) return { kind: "active_edit" as const };
      const r = await c.query<{
        id: string;
        name: string;
        date_from: string;
        date_to: string;
        active: boolean;
      }>(
        tenant.role === "MANAGER"
          ? `UPDATE school_years
             SET name = $1, date_from = $2::date, date_to = $3::date
             WHERE id = $4 AND school_id = $5 AND active = FALSE
             RETURNING id, name, date_from::text, date_to::text, active`
          : `UPDATE school_years
             SET name = $1, date_from = $2::date, date_to = $3::date
             WHERE id = $4 AND active = FALSE
             RETURNING id, name, date_from::text, date_to::text, active`,
        tenant.role === "MANAGER"
          ? [name.trim(), date_from, date_to, yearId, tenant.tenantSchoolId]
          : [name.trim(), date_from, date_to, yearId]
      );
      if (!r.rows[0]) return { kind: "update_fail" as const };
      return { kind: "ok" as const, row: r.rows[0] };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ message: "Nie znaleziono roku szkolnego" }, { status: 404 });
    }
    if (result.kind === "active_edit") {
      return NextResponse.json(
        { message: "Edycja dozwolona tylko dla roku nieaktywnego (name, date_from, date_to przy active=FALSE)" },
        { status: 400 }
      );
    }
    if (result.kind === "update_fail") {
      return NextResponse.json({ message: "Nie udało się zapisać zmian" }, { status: 400 });
    }

    const row = result.row;
    return NextResponse.json({
      year: {
        ...row,
        date_from: String(row.date_from).slice(0, 10),
        date_to: String(row.date_to).slice(0, 10),
        isActive: row.active,
      },
    });
  } catch (error) {
    console.error("PUT school-years/[id] error:", error);
    return NextResponse.json({ message: "Błąd zapisu roku szkolnego" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteCtx) {
  const userId = await ensureSchoolAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const { id: yearId } = await context.params;
  try {
    let body: { action?: string } = {};
    try {
      body = (await request.json()) as { action?: string };
    } catch {
      /* brak body */
    }
    if (body.action !== "close") {
      return NextResponse.json({ message: 'Wymagane body: { "action": "close" }' }, { status: 400 });
    }

    const result = await runPgTransaction(async (c) => {
      const y = await c.query<{ active: boolean; school_id: string }>(
        tenant.role === "MANAGER"
          ? `SELECT active, school_id FROM school_years WHERE id = $1 AND school_id = $2 LIMIT 1`
          : `SELECT active, school_id FROM school_years WHERE id = $1 LIMIT 1`,
        tenant.role === "MANAGER" ? [yearId, tenant.tenantSchoolId] : [yearId]
      );
      if (!y.rows[0]) return { kind: "not_found" as const };
      if (!y.rows[0].active) return { kind: "not_active" as const };
      const yearSchoolId = y.rows[0].school_id;

      const lessons = await c.query(
        `UPDATE lessons l
         SET status = 'CANCELLED'
         FROM groups g
         WHERE l.group_id = g.id
           AND g.school_id = $1
           AND g.school_year_id = $2
           AND l.status = 'SCHEDULED'
           AND l.scheduled_at > NOW()
         RETURNING l.id`,
        [yearSchoolId, yearId]
      );

      const groups = await c.query(
        `UPDATE groups
         SET active = FALSE
         WHERE school_id = $1 AND school_year_id = $2
         RETURNING id`,
        [yearSchoolId, yearId]
      );

      const subs = await c.query(
        `UPDATE subscriptions s
         SET status = 'EXPIRED'
         WHERE s.school_id = $1
           AND s.status IN ('ACTIVE', 'PAUSED')
           AND (
             s.school_year_id = $2
             OR s.group_id IN (SELECT id FROM groups WHERE school_id = $1 AND school_year_id = $2)
           )
         RETURNING s.id`,
        [yearSchoolId, yearId]
      );

      const closedYear = await c.query(
        tenant.role === "MANAGER"
          ? `UPDATE school_years SET active = FALSE WHERE id = $1 AND school_id = $2 AND active = TRUE RETURNING id`
          : `UPDATE school_years SET active = FALSE WHERE id = $1 AND active = TRUE RETURNING id`,
        tenant.role === "MANAGER" ? [yearId, yearSchoolId] : [yearId]
      );
      if (!closedYear.rows[0]) {
        throw new Error("YEAR_CLOSE_CONFLICT");
      }

      return {
        kind: "ok" as const,
        lessonsCancelled: lessons.rowCount ?? 0,
        groupsClosed: groups.rowCount ?? 0,
        subscriptionsExpired: subs.rowCount ?? 0,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ message: "Nie znaleziono roku szkolnego" }, { status: 404 });
    }
    if (result.kind === "not_active") {
      return NextResponse.json({ message: "Ten rok szkolny nie jest aktywny" }, { status: 400 });
    }

    return NextResponse.json({
      lessonsCancelled: result.lessonsCancelled,
      groupsClosed: result.groupsClosed,
      subscriptionsExpired: result.subscriptionsExpired,
    });
  } catch (error) {
    console.error("DELETE school-years/[id] error:", error);
    return NextResponse.json({ message: "Błąd zamykania roku szkolnego" }, { status: 500 });
  }
}
