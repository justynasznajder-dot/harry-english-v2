import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";
import { generateLessonsForGroup } from "@/lib/lesson-generation";

export type HolidayLessonDeletionByGroup = {
  groupId: string;
  deletedCount: number;
};

export type DeleteScheduledLessonsInHolidayRangeResult = {
  deleted: number;
  byGroup: HolidayLessonDeletionByGroup[];
};

export type HolidayLessonPurgeAuditContext = {
  actorUserId?: string | null;
  holidayId?: string | null;
  holidayName?: string | null;
  source?: string | null;
};

type LessonSnapshotRow = {
  id: string;
  group_id: string;
  group_name: string;
  scheduled_at: Date | string;
  duration_min: number;
  status: string;
  location_id: string | null;
  teacher_id: string | null;
  schedule_template_id: string | null;
  school_year_id: string | null;
  cancellation_reason: string | null;
};

function toIso(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/**
 * Usuwa zajęcia szkoły w zakresie dat dnia wolnego:
 * - SCHEDULED
 * - CANCELLED z powodem „Dzień wolny” (stary flow anulowania)
 * COMPLETED zostają w historii. Czyści attendance / progress_notes.
 *
 * `groupIds` — jeśli podane i niepuste, tylko te grupy; w przeciwnym razie wszystkie grupy szkoły.
 */
export async function deleteScheduledLessonsInHolidayRange(
  schoolId: string,
  dateFrom: string,
  dateTo: string,
  groupIds?: string[] | null,
  audit?: HolidayLessonPurgeAuditContext | null,
): Promise<DeleteScheduledLessonsInHolidayRangeResult> {
  const scoped =
    Array.isArray(groupIds) && groupIds.length > 0
      ? groupIds.filter((id) => typeof id === "string" && id.trim())
      : null;

  const selectSql = `SELECT
        l.id,
        l.group_id,
        g.name AS group_name,
        l.scheduled_at,
        l.duration_min,
        l.status::text AS status,
        l.location_id,
        l.teacher_id,
        l.schedule_template_id,
        l.school_year_id,
        l.cancellation_reason
      FROM lessons l
      INNER JOIN groups g ON g.id = l.group_id
      WHERE g.school_id = $1
        ${scoped ? "AND l.group_id = ANY($4::text[])" : ""}
        AND l.scheduled_at::date >= $2::date
        AND l.scheduled_at::date <= $3::date
        AND (
          l.status = 'SCHEDULED'
          OR (
            l.status = 'CANCELLED'
            AND COALESCE(l.cancellation_reason, '') ILIKE '%dzień wolny%'
          )
        )`;

  const scheduled = scoped
    ? await queryDb<LessonSnapshotRow>(selectSql, [schoolId, dateFrom, dateTo, scoped])
    : await queryDb<LessonSnapshotRow>(selectSql, [schoolId, dateFrom, dateTo]);

  if (scheduled.rows.length === 0) {
    return { deleted: 0, byGroup: [] };
  }

  const ids = scheduled.rows.map((r) => r.id);
  const counts = new Map<string, number>();
  for (const row of scheduled.rows) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  const snapshot = scheduled.rows.map((r) => ({
    id: r.id,
    group_id: r.group_id,
    group_name: r.group_name,
    scheduled_at: toIso(r.scheduled_at),
    duration_min: r.duration_min,
    status: r.status,
    location_id: r.location_id,
    teacher_id: r.teacher_id,
    schedule_template_id: r.schedule_template_id,
    school_year_id: r.school_year_id,
    cancellation_reason: r.cancellation_reason,
  }));

  await queryDb(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [ids]);
  await queryDb(`DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`, [ids]);
  const deleted = await queryDb<{ id: string }>(
    `DELETE FROM lessons
     WHERE id = ANY($1::text[])
       AND status = 'SCHEDULED'
     RETURNING id`,
    [ids],
  );

  const deletedCount = deleted.rowCount ?? 0;
  const byGroup = [...counts.entries()].map(([groupId, count]) => ({
    groupId,
    deletedCount: count,
  }));

  if (deletedCount > 0 || snapshot.length > 0) {
    const holidayLabel = audit?.holidayName?.trim() || null;
    const rangeLabel = dateFrom === dateTo ? dateFrom : `${dateFrom}–${dateTo}`;
    await writeAdminDeletionLog({
      schoolId,
      actorUserId: audit?.actorUserId ?? null,
      action: "HOLIDAY_LESSON_PURGE",
      summary: holidayLabel
        ? `Usunięto ${deletedCount} zajęć z kalendarza (dzień wolny: ${holidayLabel}, ${rangeLabel})`
        : `Usunięto ${deletedCount} zajęć z kalendarza (dzień wolny ${rangeLabel})`,
      payload: {
        dateFrom,
        dateTo,
        groupIds: scoped,
        holidayId: audit?.holidayId ?? null,
        holidayName: holidayLabel,
        source: audit?.source ?? null,
        deletedCount,
        selectedCount: snapshot.length,
        byGroup,
        lessons: snapshot,
      },
    });
  }

  return {
    deleted: deletedCount,
    byGroup,
  };
}

export type HolidayLessonRestoreByGroup = {
  groupId: string;
  groupName: string;
  restored: number;
  trimmed: number;
};

export type RestoreScheduleSlotsAfterHolidayRemovalResult = {
  groupsProcessed: number;
  restored: number;
  trimmed: number;
  byGroup: HolidayLessonRestoreByGroup[];
};

/**
 * Po usunięciu dnia wolnego: dokłada brakujące zajęcia z harmonogramu w zakresie dat
 * i usuwa tyle samo ostatnich SCHEDULED poza tym zakresem (liczba zajęć bez zmian).
 */
export async function restoreScheduleSlotsAfterHolidayRemoval(opts: {
  schoolId: string;
  dateFrom: string;
  dateTo: string;
  /** null / puste = wszystkie aktywne grupy szkoły */
  groupIds?: string[] | null;
  actorUserId?: string | null;
}): Promise<RestoreScheduleSlotsAfterHolidayRemovalResult> {
  const { schoolId, dateFrom, dateTo, actorUserId } = opts;
  const scoped =
    Array.isArray(opts.groupIds) && opts.groupIds.length > 0
      ? opts.groupIds.filter((id) => typeof id === "string" && id.trim())
      : null;

  const groupsRes = scoped
    ? await queryDb<{
        id: string;
        name: string;
        teacher_id: string | null;
        has_confirmed: boolean;
      }>(
        `SELECT g.id, g.name, g.teacher_id,
                EXISTS (
                  SELECT 1
                  FROM schedule_templates st
                  JOIN school_years sy ON sy.id = st.school_year_id
                    AND sy.school_id = g.school_id
                    AND sy.active = TRUE
                  WHERE st.group_id = g.id
                    AND st.active = TRUE
                ) AS has_confirmed
         FROM groups g
         WHERE g.school_id = $1
           AND g.id = ANY($2::text[])
           AND g.deleted_at IS NULL
           AND g.active = TRUE
         ORDER BY g.name`,
        [schoolId, scoped],
      )
    : await queryDb<{
        id: string;
        name: string;
        teacher_id: string | null;
        has_confirmed: boolean;
      }>(
        `SELECT g.id, g.name, g.teacher_id,
                EXISTS (
                  SELECT 1
                  FROM schedule_templates st
                  JOIN school_years sy ON sy.id = st.school_year_id
                    AND sy.school_id = g.school_id
                    AND sy.active = TRUE
                  WHERE st.group_id = g.id
                    AND st.active = TRUE
                ) AS has_confirmed
         FROM groups g
         WHERE g.school_id = $1
           AND g.deleted_at IS NULL
           AND g.active = TRUE
         ORDER BY g.name`,
        [schoolId],
      );

  const activeYear = await getActiveSchoolYear(schoolId);
  const yearId = activeYear ? String((activeYear as { id: string }).id) : null;

  let restoredTotal = 0;
  let trimmedTotal = 0;
  let groupsProcessed = 0;
  const byGroup: HolidayLessonRestoreByGroup[] = [];

  for (const group of groupsRes.rows) {
    if (!group.teacher_id || !group.has_confirmed || !yearId) continue;

    const gen = await generateLessonsForGroup({
      schoolId,
      groupId: group.id,
      teacherId: group.teacher_id,
      dateFrom,
      dateTo,
      onlyConfirmedForSchoolYearId: yearId,
      skipHolidayEnsure: true,
    });
    if (!gen.ok || gen.created < 1) continue;

    const restored = gen.created;
    const toTrim = await queryDb<{
      id: string;
      group_id: string;
      scheduled_at: Date | string;
      duration_min: number;
      status: string;
      location_id: string;
      teacher_id: string;
      schedule_template_id: string | null;
      school_year_id: string | null;
      notes: string | null;
      cancellation_reason: string | null;
    }>(
      `SELECT id, group_id, scheduled_at, duration_min, status::text AS status,
              location_id, teacher_id, schedule_template_id, school_year_id,
              notes, cancellation_reason
       FROM lessons
       WHERE group_id = $1
         AND status = 'SCHEDULED'
         AND (scheduled_at::date < $2::date OR scheduled_at::date > $3::date)
       ORDER BY scheduled_at DESC
       LIMIT $4`,
      [group.id, dateFrom, dateTo, restored],
    );

    const trimIds = toTrim.rows.map((r) => r.id);
    let trimmed = 0;
    if (trimIds.length > 0) {
      await queryDb(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [trimIds]);
      await queryDb(`DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`, [trimIds]);
      const deleted = await queryDb<{ id: string }>(
        `DELETE FROM lessons
         WHERE id = ANY($1::text[])
           AND status = 'SCHEDULED'
         RETURNING id`,
        [trimIds],
      );
      trimmed = deleted.rowCount ?? 0;

      await writeAdminDeletionLog({
        schoolId,
        actorUserId: actorUserId ?? null,
        action: "LESSONS_FUTURE_DELETE",
        summary: `Po przywróceniu dnia wolnego usunięto ${trimmed} ostatnich zajęć grupy „${group.name}”`,
        payload: {
          groupId: group.id,
          groupName: group.name,
          restoredInRange: { dateFrom, dateTo, restored },
          deletedCount: trimmed,
          source: "restoreScheduleSlotsAfterHolidayRemoval",
          lessons: toTrim.rows.map((r) => ({
            id: r.id,
            group_id: r.group_id,
            group_name: group.name,
            scheduled_at:
              r.scheduled_at instanceof Date
                ? r.scheduled_at.toISOString()
                : String(r.scheduled_at),
            duration_min: r.duration_min,
            status: r.status,
            location_id: r.location_id,
            teacher_id: r.teacher_id,
            schedule_template_id: r.schedule_template_id,
            school_year_id: r.school_year_id,
            notes: r.notes,
            cancellation_reason: r.cancellation_reason,
          })),
        },
      });
    }

    groupsProcessed += 1;
    restoredTotal += restored;
    trimmedTotal += trimmed;
    byGroup.push({
      groupId: group.id,
      groupName: group.name,
      restored,
      trimmed,
    });
  }

  return {
    groupsProcessed,
    restored: restoredTotal,
    trimmed: trimmedTotal,
    byGroup,
  };
}

