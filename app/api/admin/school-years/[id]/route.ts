import { NextRequest, NextResponse } from "next/server";
import { runPgTransaction } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { runSchoolYearCloseSteps } from "@/lib/school-year-history";
import { randomUUID } from "crypto";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

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
        ctx.tenant.role === "MANAGER"
          ? `SELECT active FROM school_years WHERE id = $1 AND school_id = $2 LIMIT 1`
          : `SELECT active FROM school_years WHERE id = $1 LIMIT 1`,
        ctx.tenant.role === "MANAGER" ? [yearId, ctx.schoolId] : [yearId]
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
        ctx.tenant.role === "MANAGER"
          ? `UPDATE school_years
             SET name = $1, date_from = $2::date, date_to = $3::date
             WHERE id = $4 AND school_id = $5 AND active = FALSE
             RETURNING id, name, date_from::text, date_to::text, active`
          : `UPDATE school_years
             SET name = $1, date_from = $2::date, date_to = $3::date
             WHERE id = $4 AND active = FALSE
             RETURNING id, name, date_from::text, date_to::text, active`,
        ctx.tenant.role === "MANAGER"
          ? [name.trim(), date_from, date_to, yearId, ctx.schoolId]
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
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

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
      const y = await c.query<{ active: boolean; school_id: string; date_to: string }>(
        ctx.tenant.role === "MANAGER"
          ? `SELECT active, school_id, date_to::text FROM school_years WHERE id = $1 AND school_id = $2 LIMIT 1`
          : `SELECT active, school_id, date_to::text FROM school_years WHERE id = $1 LIMIT 1`,
        ctx.tenant.role === "MANAGER" ? [yearId, ctx.schoolId] : [yearId]
      );
      if (!y.rows[0]) return { kind: "not_found" as const };
      if (!y.rows[0].active) return { kind: "not_active" as const };
      const yearSchoolId = y.rows[0].school_id;
      const dateTo = String(y.rows[0].date_to).slice(0, 10);

      const nextYear = await c.query<{ id: string; name: string }>(
        `SELECT id, name FROM school_years
         WHERE school_id = $1
           AND active = FALSE
           AND closed_at IS NULL
           AND date_from > $2::date
         ORDER BY date_from ASC
         LIMIT 1`,
        [yearSchoolId, dateTo]
      );
      const nextYearId = nextYear.rows[0]?.id ?? null;

      const closeCounts = await runSchoolYearCloseSteps(
        c,
        yearSchoolId,
        yearId,
        dateTo,
        nextYearId
      );

      const closedYear = await c.query(
        ctx.tenant.role === "MANAGER"
          ? `UPDATE school_years
             SET active = FALSE, closed_at = NOW(), closed_by = $3
             WHERE id = $1 AND school_id = $2 AND active = TRUE
             RETURNING id`
          : `UPDATE school_years
             SET active = FALSE, closed_at = NOW(), closed_by = $2
             WHERE id = $1 AND active = TRUE
             RETURNING id`,
        ctx.tenant.role === "MANAGER" ? [yearId, yearSchoolId, ctx.userId] : [yearId, ctx.userId]
      );
      if (!closedYear.rows[0]) {
        throw new Error("YEAR_CLOSE_CONFLICT");
      }

      await c.query(
        `INSERT INTO school_year_close_logs (
           id, school_id, school_year_id, closed_by, closed_at,
           lessons_cancelled, lessons_completed, groups_deactivated,
           memberships_closed, subscriptions_expired, schedule_templates_deactivated
         ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          yearSchoolId,
          yearId,
          ctx.userId,
          closeCounts.lessonsCancelled,
          closeCounts.lessonsCompleted,
          closeCounts.groupsClosed,
          closeCounts.membershipsClosed,
          closeCounts.subscriptionsExpired,
          closeCounts.scheduleTemplatesDeactivated,
        ]
      );

      let activatedNextYear: { id: string; name: string } | null = null;
      if (nextYear.rows[0]) {
        const activated = await c.query<{ id: string; name: string }>(
          `UPDATE school_years
           SET active = TRUE
           WHERE id = $1 AND school_id = $2 AND active = FALSE
           RETURNING id, name`,
          [nextYear.rows[0].id, yearSchoolId]
        );
        activatedNextYear = activated.rows[0] ?? null;
      }

      return {
        kind: "ok" as const,
        ...closeCounts,
        activatedNextYear,
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
      lessonsCompleted: result.lessonsCompleted,
      groupsClosed: result.groupsClosed,
      membershipsClosed: result.membershipsClosed,
      membershipsCarried: result.membershipsCarried,
      subscriptionsExpired: result.subscriptionsExpired,
      scheduleTemplatesDeactivated: result.scheduleTemplatesDeactivated,
      activatedNextYear: result.activatedNextYear ?? null,
    });
  } catch (error) {
    console.error("DELETE school-years/[id] error:", error);
    return NextResponse.json({ message: "Błąd zamykania roku szkolnego" }, { status: 500 });
  }
}
