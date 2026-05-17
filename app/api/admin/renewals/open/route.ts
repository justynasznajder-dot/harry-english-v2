import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import { validateRenewalSeason } from "@/lib/renewals";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const body = (await request.json().catch(() => ({}))) as { season?: unknown };
    const season = typeof body.season === "string" ? body.season.trim() : "";
    if (!validateRenewalSeason(season)) {
      return NextResponse.json(
        { message: 'Niepoprawny format sezonu (oczekiwany np. "2025/2026")' },
        { status: 400 }
      );
    }

    await queryDb(
      `UPDATE schools SET renewals_open = TRUE, renewals_season = $2 WHERE id = $1`,
      [schoolId, season]
    );

    const insertRes = await queryDb<{ id: string }>(
      `INSERT INTO renewals (
         id, school_id, child_id, parent_id, season, status, initiated_at, created_at
       )
       SELECT
         gen_random_uuid(),
         c.school_id,
         c.id,
         c.parent_id,
         $2,
         'PENDING_CONFIRMATION',
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
