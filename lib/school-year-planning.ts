import { getActiveSchoolYear, queryDb } from "@/lib/db";

export type SchoolYearPlanningRow = {
  id: string;
  school_id: string;
  name: string;
  date_from: string;
  date_to: string;
  active: boolean;
  closed_at: string | null;
};

function mapYearRow(row: {
  id: string;
  school_id: string;
  name: string;
  date_from: string;
  date_to: string;
  active: boolean;
  closed_at?: Date | string | null;
}): SchoolYearPlanningRow {
  return {
    id: row.id,
    school_id: row.school_id,
    name: row.name,
    date_from: String(row.date_from).slice(0, 10),
    date_to: String(row.date_to).slice(0, 10),
    active: row.active,
    closed_at: row.closed_at ? String(row.closed_at) : null,
  };
}

/** Kolejny rok dodany przez managera (nieaktywny, z datą rozpoczęcia po aktywnym roku). */
export async function getPlannedNextSchoolYear(
  schoolId: string
): Promise<SchoolYearPlanningRow | null> {
  const active = await getActiveSchoolYear(schoolId);
  if (!active) return null;

  const res = await queryDb<{
    id: string;
    school_id: string;
    name: string;
    date_from: string;
    date_to: string;
    active: boolean;
    closed_at: Date | string | null;
  }>(
    `SELECT id, school_id, name, date_from::text, date_to::text, active, closed_at
     FROM school_years
     WHERE school_id = $1
       AND active = FALSE
       AND closed_at IS NULL
       AND date_from > $2::date
     ORDER BY date_from ASC
     LIMIT 1`,
    [schoolId, String(active.date_from).slice(0, 10)]
  );
  const row = res.rows[0];
  return row ? mapYearRow(row) : null;
}

export async function getActiveSchoolYearPlanning(
  schoolId: string
): Promise<SchoolYearPlanningRow | null> {
  const active = await getActiveSchoolYear(schoolId);
  return active ? mapYearRow(active as SchoolYearPlanningRow) : null;
}

/** Wymagany planowany rok do odnowień — zwraca błąd tekstowy lub rok docelowy. */
export async function requireRenewalTargetSchoolYear(
  schoolId: string
): Promise<{ ok: true; year: SchoolYearPlanningRow } | { ok: false; message: string }> {
  const planned = await getPlannedNextSchoolYear(schoolId);
  if (!planned) {
    return {
      ok: false,
      message:
        "Dodaj kolejny rok szkolny w Organizacja → Rok szkolny. Odnowienia dotyczą zawsze planowanego kolejnego roku.",
    };
  }
  return { ok: true, year: planned };
}
