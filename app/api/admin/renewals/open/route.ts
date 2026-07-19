import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import { requireRenewalTargetSchoolYear } from "@/lib/school-year-planning";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const target = await requireRenewalTargetSchoolYear(schoolId);
    if (!target.ok) {
      return NextResponse.json({ message: target.message }, { status: 409 });
    }
    const season = target.year.name;

    await queryDb(`UPDATE schools SET renewals_season = $2 WHERE id = $1`, [schoolId, season]);

    const insertRes = await queryDb<{ id: string }>(
      `INSERT INTO renewals (
         id, school_id, child_id, parent_id, season, status, initiated_at, created_at
       )
       SELECT
         gen_random_uuid()::text,
         c.school_id,
         c.id,
         c.parent_id,
         $2,
         'DRAFT',
         NOW(),
         NOW()
       FROM children c
       WHERE c.school_id = $1
         AND c.active = TRUE
         AND UPPER(BTRIM(COALESCE(c.access_level::text, ''))) = 'SIGNED'
       ON CONFLICT (child_id, season) DO NOTHING
       RETURNING id`,
      [schoolId, season]
    );

    return NextResponse.json({ created: insertRes.rowCount ?? 0 });
  } catch (error) {
    console.error("Admin renewals open error:", error);
    return NextResponse.json({ message: "Błąd otwierania zapisów na nowy rok" }, { status: 500 });
  }
}
