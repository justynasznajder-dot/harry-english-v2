import { NextRequest, NextResponse } from "next/server";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";
import {
  deleteScheduledLessonsInHolidayRange,
  restoreScheduleSlotsAfterHolidayRemoval,
} from "@/lib/school-holiday-lessons";
import { topUpLessonsAfterHolidayDeletion } from "@/lib/lesson-generation";
import { notifyParents, type ParentNotifyRow } from "@/lib/parent-notifications";
import { requireMessageActor } from "@/lib/messages";
import { expandHolidayGroupIdsByFacilityKinds } from "@/lib/holiday-calendar-scope-server";
import {
  effectiveHolidayGroupIds,
  holidayCoverageChanged,
  type HolidayCoverageInput,
} from "@/lib/school-holiday-coverage";

type RouteCtx = { params: Promise<{ id: string }> };

const HOLIDAY_TYPES = ["HOLIDAY", "PUBLIC", "SCHOOL", "CANCELLED"] as const;

function formatDatePl(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function normalizeRequestYmd(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1] ?? t.slice(0, 10);
  const pl = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (pl) {
    const dd = pl[1].padStart(2, "0");
    const mm = pl[2].padStart(2, "0");
    return `${pl[3]}-${mm}-${dd}`;
  }
  return t.slice(0, 10);
}

function ymdFromDbValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1] ?? v.slice(0, 10);
    return v.slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return "";
}

function parseGroupIds(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return [
    ...new Set(
      raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

async function getParentsWithScheduledLessonsInRange(
  schoolId: string,
  dateFrom: string,
  dateTo: string,
  groupIds?: string[] | null,
): Promise<ParentNotifyRow[]> {
  const scoped =
    Array.isArray(groupIds) && groupIds.length > 0
      ? groupIds.filter((id) => typeof id === "string" && id.trim())
      : null;

  const res = scoped
    ? await queryDb<ParentNotifyRow>(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
         FROM lessons l
         INNER JOIN groups g ON g.id = l.group_id
         INNER JOIN group_students gs ON gs.group_id = g.id AND gs.left_at IS NULL
         INNER JOIN children c ON c.id = gs.child_id AND c.active = TRUE
         INNER JOIN users u ON u.id = c.parent_id
         WHERE g.school_id = $1
           AND l.group_id = ANY($4::text[])
           AND l.status = 'SCHEDULED'
           AND l.scheduled_at::date >= $2::date
           AND l.scheduled_at::date <= $3::date
           AND u.role = 'PARENT'
           AND u.active = TRUE
           AND u.email IS NOT NULL
           AND TRIM(u.email::text) <> ''`,
        [schoolId, dateFrom, dateTo, scoped],
      )
    : await queryDb<ParentNotifyRow>(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
         FROM lessons l
         INNER JOIN groups g ON g.id = l.group_id
         INNER JOIN group_students gs ON gs.group_id = g.id AND gs.left_at IS NULL
         INNER JOIN children c ON c.id = gs.child_id AND c.active = TRUE
         INNER JOIN users u ON u.id = c.parent_id
         WHERE g.school_id = $1
           AND l.status = 'SCHEDULED'
           AND l.scheduled_at::date >= $2::date
           AND l.scheduled_at::date <= $3::date
           AND u.role = 'PARENT'
           AND u.active = TRUE
           AND u.email IS NOT NULL
           AND TRIM(u.email::text) <> ''`,
        [schoolId, dateFrom, dateTo],
      );
  return res.rows;
}

export async function DELETE(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  try {
    let restoreLessons = false;
    try {
      const body = (await request.json()) as { restoreLessons?: unknown };
      restoreLessons = Boolean(body?.restoreLessons);
    } catch {
      /* puste body — tylko usunięcie dnia wolnego */
    }

    const existing = await queryDb<{
      id: string;
      school_id: string;
      school_year_id: string | null;
      name: string;
      date_from: string;
      date_to: string;
      type: string;
      created_at: Date | string;
    }>(
      ctx.tenant.role === "MANAGER"
        ? `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays WHERE id = $1 AND school_id = $2`
        : `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays WHERE id = $1`,
      ctx.tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id],
    );
    const holiday = existing.rows[0];
    if (!holiday) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }

    const groupsRes = await queryDb<{ group_id: string; group_name: string }>(
      `SELECT shg.group_id, g.name AS group_name
       FROM school_holiday_groups shg
       INNER JOIN groups g ON g.id = shg.group_id
       WHERE shg.holiday_id = $1
       ORDER BY g.name`,
      [id],
    );
    const groupIds = groupsRes.rows.map((r) => r.group_id);

    const del = await queryDb(
      ctx.tenant.role === "MANAGER"
        ? `DELETE FROM school_holidays WHERE id = $1 AND school_id = $2 RETURNING id`
        : `DELETE FROM school_holidays WHERE id = $1 RETURNING id`,
      ctx.tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id],
    );
    if (!del.rowCount) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }

    const rangeLabel =
      holiday.date_from === holiday.date_to
        ? holiday.date_from
        : `${holiday.date_from}–${holiday.date_to}`;

    let restore: Awaited<ReturnType<typeof restoreScheduleSlotsAfterHolidayRemoval>> | null =
      null;
    if (restoreLessons) {
      restore = await restoreScheduleSlotsAfterHolidayRemoval({
        schoolId: holiday.school_id,
        dateFrom: holiday.date_from,
        dateTo: holiday.date_to,
        groupIds: groupIds.length > 0 ? groupIds : null,
        actorUserId: ctx.userId,
      });
    }

    await writeAdminDeletionLog({
      schoolId: holiday.school_id,
      actorUserId: ctx.userId,
      action: "HOLIDAY_DELETE",
      summary: restoreLessons
        ? `Usunięto dzień wolny „${holiday.name}” (${rangeLabel}) i przywrócono zajęcia z harmonogramu`
        : `Usunięto dzień wolny „${holiday.name}” (${rangeLabel})`,
      payload: {
        holiday: {
          id: holiday.id,
          school_id: holiday.school_id,
          school_year_id: holiday.school_year_id,
          name: holiday.name,
          date_from: holiday.date_from,
          date_to: holiday.date_to,
          type: holiday.type,
          created_at:
            holiday.created_at instanceof Date
              ? holiday.created_at.toISOString()
              : String(holiday.created_at),
        },
        group_ids: groupIds,
        groups: groupsRes.rows,
        applies_to_all_groups: groupIds.length === 0,
        restoreLessons,
        restore,
      },
    });

    let message = "Usunięto dzień wolny.";
    if (restoreLessons && restore) {
      if (restore.restored > 0) {
        message += ` Przywrócono ${restore.restored} zajęć według harmonogramu`;
        if (restore.trimmed > 0) {
          message += ` i usunięto ${restore.trimmed} ostatnich z końca kalendarza`;
        }
        message += ` (${restore.groupsProcessed} grup).`;
      } else {
        message +=
          " Nie przywrócono zajęć (brak pasującego harmonogramu, nauczyciela lub terminy już były).";
      }
    }

    return NextResponse.json({
      ok: true,
      message,
      restoreLessons,
      lessonsRestored: restore?.restored ?? 0,
      lessonsTrimmed: restore?.trimmed ?? 0,
      groupsProcessed: restore?.groupsProcessed ?? 0,
    });
  } catch (error) {
    console.error("DELETE school-holidays/[id] error:", error);
    return NextResponse.json({ message: "Błąd usuwania dnia wolnego" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  try {
    const body = await request.json();
    const {
      name,
      date_from,
      date_to,
      type,
      notify_parents: notifyParentsRaw,
      parent_message,
      group_ids: bodyGroupIds,
      groupIds: bodyGroupIdsCamel,
      applies_to_preschool: bodyAppliesPreschool,
      applies_to_school: bodyAppliesSchool,
      include_preschool: bodyIncludePreschool,
      include_school: bodyIncludeSchool,
    } = body as {
      name?: string;
      date_from?: string;
      date_to?: string;
      type?: string;
      notify_parents?: boolean;
      parent_message?: string;
      group_ids?: unknown;
      groupIds?: unknown;
      applies_to_preschool?: unknown;
      applies_to_school?: unknown;
      include_preschool?: unknown;
      include_school?: unknown;
    };

    const shouldNotifyParents = notifyParentsRaw === true;
    const appliesToPreschool =
      bodyAppliesPreschool === true ||
      bodyIncludePreschool === true ||
      bodyAppliesPreschool === "true" ||
      bodyIncludePreschool === "true";
    const appliesToSchool =
      bodyAppliesSchool === true ||
      bodyIncludeSchool === true ||
      bodyAppliesSchool === "true" ||
      bodyIncludeSchool === "true";

    if (!name?.trim() || !date_from || !date_to) {
      return NextResponse.json({ message: "Brak nazwy lub zakresu dat" }, { status: 400 });
    }
    const holidayType = (type ?? "HOLIDAY").toUpperCase();
    if (!HOLIDAY_TYPES.includes(holidayType as (typeof HOLIDAY_TYPES)[number])) {
      return NextResponse.json(
        { message: "Nieprawidłowy typ (HOLIDAY, PUBLIC, SCHOOL, CANCELLED)" },
        { status: 400 },
      );
    }

    const df = normalizeRequestYmd(date_from);
    const dt = normalizeRequestYmd(date_to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      return NextResponse.json({ message: "Nieprawidłowy format dat (oczekiwane RRRR-MM-DD)" }, { status: 400 });
    }
    if (df > dt) {
      return NextResponse.json({ message: "Data „od” nie może być późniejsza niż „do”" }, { status: 400 });
    }

    const existing = await queryDb<{
      id: string;
      school_id: string;
      school_year_id: string | null;
      name: string;
      date_from: string;
      date_to: string;
      type: string;
      applies_to_preschool: boolean;
      applies_to_school: boolean;
    }>(
      ctx.tenant.role === "MANAGER"
        ? `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type,
                  COALESCE(applies_to_preschool, FALSE) AS applies_to_preschool,
                  COALESCE(applies_to_school, FALSE) AS applies_to_school
           FROM school_holidays WHERE id = $1 AND school_id = $2`
        : `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type,
                  COALESCE(applies_to_preschool, FALSE) AS applies_to_preschool,
                  COALESCE(applies_to_school, FALSE) AS applies_to_school
           FROM school_holidays WHERE id = $1`,
      ctx.tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id],
    );
    const holiday = existing.rows[0];
    if (!holiday) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }

    const schoolId = holiday.school_id;
    const oldGroupsRes = await queryDb<{ group_id: string }>(
      `SELECT group_id FROM school_holiday_groups WHERE holiday_id = $1`,
      [id],
    );
    const oldGroupIds = oldGroupsRes.rows.map((r) => r.group_id);

    let scopedGroupIds = parseGroupIds(bodyGroupIds ?? bodyGroupIdsCamel);
    if (scopedGroupIds !== null && scopedGroupIds.length === 0) {
      return NextResponse.json(
        { message: "Wybierz co najmniej jedną grupę, której dotyczy dzień wolny" },
        { status: 400 },
      );
    }

    if (scopedGroupIds && scopedGroupIds.length > 0) {
      scopedGroupIds = await expandHolidayGroupIdsByFacilityKinds(schoolId, scopedGroupIds);
      const groupsCheck = await queryDb<{ id: string }>(
        `SELECT id FROM groups
         WHERE school_id = $1
           AND id = ANY($2::text[])
           AND deleted_at IS NULL`,
        [schoolId, scopedGroupIds],
      );
      if (groupsCheck.rows.length !== scopedGroupIds.length) {
        return NextResponse.json(
          { message: "Niektóre wybrane grupy nie należą do tej szkoły" },
          { status: 400 },
        );
      }
    }

    const active = await getActiveSchoolYear(schoolId);
    if (!active) {
      return NextResponse.json({ message: "Brak aktywnego roku szkolnego" }, { status: 400 });
    }
    const yFrom = ymdFromDbValue((active as { date_from: unknown }).date_from);
    const yTo = ymdFromDbValue((active as { date_to: unknown }).date_to);
    if (!yFrom || !yTo || df < yFrom || dt > yTo) {
      return NextResponse.json(
        { message: `Dzień wolny poza zakresem aktywnego roku szkolnego (${yFrom} — ${yTo})` },
        { status: 400 },
      );
    }

    const facilityFlagsSet = appliesToPreschool || appliesToSchool;
    const storeAllGroups = appliesToPreschool && appliesToSchool;
    const holidayGroupIds =
      storeAllGroups || !scopedGroupIds || scopedGroupIds.length === 0
        ? null
        : scopedGroupIds;

    const oldCov: HolidayCoverageInput = {
      dateFrom: String(holiday.date_from).slice(0, 10),
      dateTo: String(holiday.date_to).slice(0, 10),
      groupIds: oldGroupIds,
      appliesToPreschool: Boolean(holiday.applies_to_preschool),
      appliesToSchool: Boolean(holiday.applies_to_school),
    };
    const nextCov: HolidayCoverageInput = {
      dateFrom: df,
      dateTo: dt,
      groupIds: holidayGroupIds,
      appliesToPreschool: facilityFlagsSet ? appliesToPreschool : false,
      appliesToSchool: facilityFlagsSet ? appliesToSchool : false,
    };
    const coverageChanged = holidayCoverageChanged(oldCov, nextCov);
    const oldEffectiveGroups = effectiveHolidayGroupIds(oldCov);
    const nextEffectiveGroups = effectiveHolidayGroupIds(nextCov);

    const parentsToNotify =
      shouldNotifyParents && coverageChanged
        ? await getParentsWithScheduledLessonsInRange(
            schoolId,
            df,
            dt,
            storeAllGroups ? null : scopedGroupIds,
          )
        : [];

    let messageActor: Awaited<ReturnType<typeof requireMessageActor>> | null = null;
    if (shouldNotifyParents && parentsToNotify.length > 0) {
      messageActor = await requireMessageActor(ctx.userId);
      if (!messageActor.ok) {
        return NextResponse.json({ message: messageActor.message }, { status: messageActor.status });
      }
    }

    const upd = await queryDb(
      `UPDATE school_holidays
       SET name = $2,
           date_from = $3::date,
           date_to = $4::date,
           type = $5,
           applies_to_preschool = $6,
           applies_to_school = $7
       WHERE id = $1
       RETURNING id, school_id, school_year_id, name, date_from::text, date_to::text, type,
                 applies_to_preschool, applies_to_school, created_at`,
      [
        id,
        name.trim(),
        df,
        dt,
        holidayType,
        facilityFlagsSet ? appliesToPreschool : false,
        facilityFlagsSet ? appliesToSchool : false,
      ],
    );
    const row = upd.rows[0] as Record<string, unknown>;
    if (!row) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }

    await queryDb(`DELETE FROM school_holiday_groups WHERE holiday_id = $1`, [id]);
    if (holidayGroupIds && holidayGroupIds.length > 0) {
      await queryDb(
        `INSERT INTO school_holiday_groups (holiday_id, group_id)
         SELECT $1, UNNEST($2::text[])`,
        [id, holidayGroupIds],
      );
    }

    let deletion: Awaited<ReturnType<typeof deleteScheduledLessonsInHolidayRange>> = {
      deleted: 0,
      byGroup: [],
    };
    let topUp = { created: 0, groupsProcessed: 0 };
    let restore: Awaited<ReturnType<typeof restoreScheduleSlotsAfterHolidayRemoval>> | null =
      null;

    if (coverageChanged) {
      deletion = await deleteScheduledLessonsInHolidayRange(
        schoolId,
        df,
        dt,
        nextEffectiveGroups,
        {
          actorUserId: ctx.userId,
          holidayId: id,
          holidayName: name.trim(),
          source: "PATCH /api/admin/school-holidays/[id]",
        },
      );
      topUp = await topUpLessonsAfterHolidayDeletion(schoolId, deletion.byGroup);

      restore = await restoreScheduleSlotsAfterHolidayRemoval({
        schoolId,
        dateFrom: oldCov.dateFrom,
        dateTo: oldCov.dateTo,
        groupIds: oldEffectiveGroups,
        actorUserId: ctx.userId,
      });
    }

    let parentsNotified = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    if (shouldNotifyParents && parentsToNotify.length > 0 && messageActor?.ok) {
      const dateRangeLabel =
        df === dt ? formatDatePl(df) : `${formatDatePl(df)} — ${formatDatePl(dt)}`;
      const holidayName = name.trim();
      const customMessage = typeof parent_message === "string" ? parent_message.trim() : "";
      const subject = `Dzień wolny — ${holidayName}`;
      const content =
        `Informujemy o dniu wolnym: ${holidayName} (${dateRangeLabel}).\n\n` +
        `Zaplanowane zajęcia w tym terminie zostały odwołane — kalendarz grup został uzupełniony o kolejne terminy.\n\n` +
        (customMessage ||
          "Prosimy o uwzględnienie tej informacji w planie dnia dziecka.");

      const notifyResult = await notifyParents({
        actor: messageActor.user,
        parents: parentsToNotify,
        subject,
        content,
      });
      parentsNotified = notifyResult.parentsNotified;
      emailsSent = notifyResult.emailsSent;
      emailsFailed = notifyResult.emailsFailed;
    }

    let message = "Zaktualizowano dzień wolny.";
    if (storeAllGroups) {
      message += " Dotyczy wszystkich grup (przedszkola i szkoły).";
    } else if (appliesToSchool && !appliesToPreschool) {
      message += " Dotyczy wszystkich grup szkolnych (także przyszłych).";
    } else if (appliesToPreschool && !appliesToSchool) {
      message += " Dotyczy wszystkich grup przedszkolnych (także przyszłych).";
    } else if (scopedGroupIds && scopedGroupIds.length > 0) {
      message += ` Dotyczy ${scopedGroupIds.length} grup.`;
    }
    if (deletion.deleted > 0) {
      message += ` Usunięto ${deletion.deleted} zaplanowanych zajęć w nowym okresie.`;
    }
    if (topUp.created > 0) {
      message += ` Uzupełniono ${topUp.created} brakując${
        topUp.created === 1 ? "e zajęcie" : topUp.created < 5 ? "e zajęcia" : "ych zajęć"
      } (${topUp.groupsProcessed} grup).`;
    }
    if (restore && restore.restored > 0) {
      message += ` Przywrócono ${restore.restored} zajęć w zwolnionych dniach`;
      if (restore.trimmed > 0) {
        message += ` i usunięto ${restore.trimmed} z końca kalendarza`;
      }
      message += ` (${restore.groupsProcessed} grup).`;
    }
    if (parentsNotified > 0) {
      message += ` Wysłano powiadomienia do ${parentsNotified} rodziców`;
      if (emailsSent > 0) message += ` (e-mail: ${emailsSent})`;
      if (emailsFailed > 0) message += ` — nie udało się wysłać ${emailsFailed} e-maili`;
      message += ".";
    }

    return NextResponse.json({
      holiday: {
        ...row,
        date_from: String(row.date_from).slice(0, 10),
        date_to: String(row.date_to).slice(0, 10),
        group_ids: holidayGroupIds ?? [],
        applies_to_preschool: facilityFlagsSet ? appliesToPreschool : false,
        applies_to_school: facilityFlagsSet ? appliesToSchool : false,
        applies_to_all_groups: storeAllGroups || !holidayGroupIds || holidayGroupIds.length === 0,
      },
      lessonsCancelled: deletion.deleted,
      lessonsDeleted: deletion.deleted,
      lessonsRegenerated: topUp.created,
      groupsToppedUp: topUp.groupsProcessed,
      lessonsRestored: restore?.restored ?? 0,
      lessonsTrimmed: restore?.trimmed ?? 0,
      groupsRestored: restore?.groupsProcessed ?? 0,
      parentsNotified,
      emailsSent,
      emailsFailed,
      message,
    });
  } catch (error) {
    console.error("PATCH school-holidays/[id] error:", error);
    return NextResponse.json({ message: "Błąd edycji dnia wolnego" }, { status: 500 });
  }
}
