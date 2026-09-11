import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { normalizeLessonsPerWeek } from "@/lib/lessons-per-week";

/** Etykieta jak u rodzica: „Poniedziałek 12:45” lub „Poniedziałek 12:45, Środa 12:45”. */
export async function buildGroupScheduleLabel(groupId: string): Promise<string> {
  const res = await queryDb<{ schedule: string | null }>(
    `SELECT NULLIF(
       STRING_AGG(
         DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
         ', '
       ),
       ''
     ) AS schedule
     FROM schedule_templates st
     WHERE st.group_id = $1
       AND st.active = TRUE`,
    [groupId]
  );
  return (res.rows[0]?.schedule ?? "").trim();
}

export type ScheduleMutationGate = {
  ok: true;
  scheduleChangeNotice: boolean;
  scheduleBeforeLabel: string | null;
  templateCount: number;
  expectedSlots: number;
  initialSetupIncomplete: boolean;
} | {
  ok: false;
  status: number;
  message: string;
};

/**
 * Pierwsze uzupełnienie harmonogramu (0→1 przy 1×, 0→2 przy 2×) bez checkboxa.
 * Gdy oczekiwana liczba terminów już jest — mutacje tylko przy zaznaczonej „zmianie harmonogramu”.
 */
export async function assertGroupScheduleMutationAllowed(
  groupId: string,
  schoolId: string
): Promise<ScheduleMutationGate> {
  const res = await queryDb<{
    schedule_change_notice: boolean;
    schedule_before_label: string | null;
    lessons_per_week: number | null;
    template_count: number;
  }>(
    `SELECT g.schedule_change_notice,
            g.schedule_before_label,
            g.lessons_per_week,
            (
              SELECT COUNT(*)::int
              FROM schedule_templates st
              WHERE st.group_id = g.id
                AND st.active = TRUE
            ) AS template_count
     FROM groups g
     WHERE g.id = $1
       AND g.school_id = $2
       AND g.deleted_at IS NULL
     LIMIT 1`,
    [groupId, schoolId]
  );
  const row = res.rows[0];
  if (!row) {
    return { ok: false, status: 404, message: "Nie znaleziono grupy" };
  }

  const expectedSlots = normalizeLessonsPerWeek(row.lessons_per_week) === 2 ? 2 : 1;
  const templateCount = Number(row.template_count) || 0;
  const initialSetupIncomplete = templateCount < expectedSlots;
  const scheduleChangeNotice = Boolean(row.schedule_change_notice);

  if (!initialSetupIncomplete && !scheduleChangeNotice) {
    return {
      ok: false,
      status: 403,
      message:
        "Harmonogram jest zablokowany. Zaznacz „zmiana harmonogramu”, aby dodać lub zmienić terminy.",
    };
  }

  return {
    ok: true,
    scheduleChangeNotice,
    scheduleBeforeLabel: row.schedule_before_label,
    templateCount,
    expectedSlots,
    initialSetupIncomplete,
  };
}

/**
 * Włącza/wyłącza widoczność komunikatu u rodziców.
 * Przy pierwszym włączeniu zapisuje snapshot (nie nadpisuje istniejącego).
 * Wyłączenie nie czyści snapshotu. Bez maili / wiadomości.
 */
export async function setGroupScheduleChangeNotice(
  groupId: string,
  schoolId: string,
  enabled: boolean
): Promise<
  | {
      ok: true;
      scheduleChangeNotice: boolean;
      scheduleBeforeLabel: string | null;
    }
  | { ok: false; status: number; message: string }
> {
  const existing = await queryDb<{
    id: string;
    schedule_change_notice: boolean;
    schedule_before_label: string | null;
  }>(
    `SELECT id, schedule_change_notice, schedule_before_label
     FROM groups
     WHERE id = $1
       AND school_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [groupId, schoolId]
  );
  const row = existing.rows[0];
  if (!row) {
    return { ok: false, status: 404, message: "Nie znaleziono grupy" };
  }

  let beforeLabel = row.schedule_before_label?.trim() || null;

  if (enabled && !beforeLabel) {
    const label = await buildGroupScheduleLabel(groupId);
    if (!label) {
      return {
        ok: false,
        status: 400,
        message:
          "Najpierw ustaw termin zajęć w harmonogramie — dopiero potem zaznacz zmianę (snapshot z umowy).",
      };
    }
    beforeLabel = label;
  }

  const updated = await queryDb<{
    schedule_change_notice: boolean;
    schedule_before_label: string | null;
  }>(
    `UPDATE groups
     SET schedule_change_notice = $3,
         schedule_before_label = COALESCE(schedule_before_label, $4)
     WHERE id = $1
       AND school_id = $2
     RETURNING schedule_change_notice, schedule_before_label`,
    [groupId, schoolId, enabled, beforeLabel]
  );

  return {
    ok: true,
    scheduleChangeNotice: Boolean(updated.rows[0]?.schedule_change_notice),
    scheduleBeforeLabel: updated.rows[0]?.schedule_before_label ?? beforeLabel,
  };
}
