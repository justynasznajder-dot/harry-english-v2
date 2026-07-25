import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryDb, runPgTransaction } from "@/lib/db";
import {
  requireAdminSchoolContext,
  resolveInsertSchoolId,
} from "@/lib/admin-school-context";
import { attachOpenMembershipsToYear } from "@/lib/school-year-history";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const schoolClause = ctx.tenant.role === "MANAGER" ? `WHERE school_id = $1` : "";
  const listParams = ctx.tenant.role === "MANAGER" ? [ctx.schoolId] : [];

  try {
    const r = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      date_from: string;
      date_to: string;
      active: boolean;
      created_at: Date;
    }>(
      `SELECT id, school_id, name, date_from::text, date_to::text, active, created_at
       FROM school_years
       ${schoolClause}
       ORDER BY date_from DESC`,
      listParams
    );
    const years = r.rows.map((row) => ({
      ...row,
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
      isActive: row.active,
    }));
    return NextResponse.json({ years });
  } catch (error) {
    console.error("GET school-years error:", error);
    return NextResponse.json({ message: "Błąd pobierania lat szkolnych" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const {
      name,
      date_from,
      date_to,
      school_id: bodySchoolId,
      schoolId: bodySchoolIdCamel,
    } = body as {
      name?: string;
      date_from?: string;
      date_to?: string;
      school_id?: string;
      schoolId?: string;
    };
    if (!name?.trim() || !date_from || !date_to) {
      return NextResponse.json({ message: "Brak nazwy lub zakresu dat" }, { status: 400 });
    }

    const insertSchoolId = resolveInsertSchoolId(ctx.tenant, { bodySchoolId, bodySchoolIdCamel });
    if (ctx.tenant.role === "MANAGER" && insertSchoolId === null) {
      return NextResponse.json(
        { message: "Manager może tworzyć rok szkolny tylko dla swojej szkoły" },
        { status: 403 }
      );
    }
    if (!insertSchoolId) {
      return NextResponse.json(
        { message: "Brak identyfikatora szkoły (school_id / schoolId lub SCHOOL_ID w środowisku)" },
        { status: 400 }
      );
    }

    const active = await queryDb<{ id: string; date_from: string }>(
      `SELECT id, date_from::text AS date_from FROM school_years WHERE school_id = $1 AND active = TRUE LIMIT 1`,
      [insertSchoolId]
    );
    const activeRow = active.rows[0];

    if (activeRow) {
      const planned = await queryDb<{ id: string }>(
        `SELECT id FROM school_years
         WHERE school_id = $1 AND active = FALSE AND closed_at IS NULL AND date_from > $2::date
         ORDER BY date_from ASC
         LIMIT 1`,
        [insertSchoolId, String(activeRow.date_from).slice(0, 10)]
      );
      if (planned.rows[0]) {
        return NextResponse.json(
          { message: "Kolejny rok szkolny jest już dodany. Edytuj go lub zakończ bieżący rok, aby go aktywować." },
          { status: 409 }
        );
      }
      if (date_from <= String(activeRow.date_from).slice(0, 10)) {
        return NextResponse.json(
          { message: "Data rozpoczęcia kolejnego roku musi być późniejsza niż rok aktywny" },
          { status: 400 }
        );
      }
    }

    const createActive = !activeRow;
    const id = randomUUID();
    const row = await runPgTransaction(async (c) => {
      const ins = await c.query<{
        id: string;
        school_id: string;
        name: string;
        date_from: string;
        date_to: string;
        active: boolean;
        created_at: Date;
      }>(
        `INSERT INTO school_years (id, school_id, name, date_from, date_to, active, created_at)
         VALUES ($1, $2, $3, $4::date, $5::date, $6, NOW())
         RETURNING id, school_id, name, date_from::text, date_to::text, active, created_at`,
        [id, insertSchoolId, name.trim(), date_from, date_to, createActive]
      );
      const created = ins.rows[0];
      if (created && createActive) {
        // Dzieci, które zostały w grupach po zamknięciu poprzedniego roku bez „kolejnego”,
        // przypisz do nowego aktywnego roku.
        await attachOpenMembershipsToYear(
          c,
          insertSchoolId,
          created.id,
          String(date_from).slice(0, 10)
        );
      }
      return created;
    });

    return NextResponse.json({
      year: row
        ? {
            ...row,
            date_from: String(row.date_from).slice(0, 10),
            date_to: String(row.date_to).slice(0, 10),
            isActive: row.active,
          }
        : null,
    });
  } catch (error) {
    console.error("POST school-years error:", error);
    return NextResponse.json({ message: "Błąd tworzenia roku szkolnego" }, { status: 500 });
  }
}
