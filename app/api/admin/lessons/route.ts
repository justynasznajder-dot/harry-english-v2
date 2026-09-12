import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { ensurePolishPublicHolidaysForSchoolYear } from "@/lib/ensure-polish-public-holidays";
import { listPolishPublicHolidays } from "@/lib/polish-public-holidays";
import {
  classifyGroupFacilityKindForHoliday,
  holidayAudienceLabel,
  resolveHolidayCalendarScope,
  type HolidayCalendarScope,
  type HolidayFacilityKind,
} from "@/lib/holiday-calendar-scope";
import {
  SCHOOL_TIMEZONE,
  sqlSchoolTimestampAsTimestamptz,
  toIsoUtc,
} from "@/lib/school-timezone";

const TZ = SCHOOL_TIMEZONE;
const MAX_RANGE_DAYS = 120;

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseIdList(raw: string | null): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function normalizeGroupIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { searchParams } = new URL(request.url);
  const fromYmd = searchParams.get("from")?.trim() ?? "";
  const toYmd = searchParams.get("to")?.trim() ?? "";
  if (!isYmd(fromYmd) || !isYmd(toYmd)) {
    return NextResponse.json(
      { message: "Parametry from i to muszą być w formacie RRRR-MM-DD" },
      { status: 400 },
    );
  }
  if (fromYmd > toYmd) {
    return NextResponse.json({ message: "Data „from” nie może być późniejsza niż „to”" }, { status: 400 });
  }

  const fromD = new Date(`${fromYmd}T12:00:00Z`);
  const toD = new Date(`${toYmd}T12:00:00Z`);
  const spanDays = Math.ceil((toD.getTime() - fromD.getTime()) / 86400000) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { message: `Zakres nie może przekraczać ${MAX_RANGE_DAYS} dni` },
      { status: 400 },
    );
  }

  const locationIds = parseIdList(searchParams.get("location_ids"));
  const teacherIds = parseIdList(searchParams.get("teacher_ids"));
  const groupIds = parseIdList(searchParams.get("group_ids"));

  const lessonParams: unknown[] = [fromYmd, toYmd];
  const lessonWhere: string[] = [
    `l.scheduled_at >= $1::date`,
    `l.scheduled_at < ($2::date + interval '1 day')`,
  ];
  let p = 3;
  if (ctx.tenant.role === "MANAGER") {
    lessonWhere.push(`g.school_id = $${p}`);
    lessonParams.push(ctx.schoolId);
    p++;
  }
  // Obecność parametru = filtr aktywny; pusta lista = brak wyników (nie „pokaż wszystko”).
  if (searchParams.has("location_ids")) {
    if (locationIds.length > 0) {
      lessonWhere.push(`l.location_id = ANY($${p}::text[])`);
      lessonParams.push(locationIds);
      p++;
    } else {
      lessonWhere.push("FALSE");
    }
  }
  if (searchParams.has("teacher_ids")) {
    if (teacherIds.length > 0) {
      lessonWhere.push(`l.teacher_id = ANY($${p}::text[])`);
      lessonParams.push(teacherIds);
      p++;
    } else {
      lessonWhere.push("FALSE");
    }
  }
  if (searchParams.has("group_ids")) {
    if (groupIds.length > 0) {
      lessonWhere.push(`l.group_id = ANY($${p}::text[])`);
      lessonParams.push(groupIds);
      p++;
    } else {
      lessonWhere.push("FALSE");
    }
  }

  const holidayParams: unknown[] = [fromYmd, toYmd];
  const holidayWhere = [`h.date_to >= $1::date`, `h.date_from <= $2::date`];
  let hp = 3;
  if (ctx.tenant.role === "MANAGER") {
    holidayWhere.push(`h.school_id = $${hp}`);
    holidayParams.push(ctx.schoolId);
    hp++;
  }

  try {
    await completePastScheduledLessons();

    if (ctx.schoolId) {
      try {
        await ensurePolishPublicHolidaysForSchoolYear({ schoolId: ctx.schoolId });
      } catch (seedErr) {
        console.error("ensurePolishPublicHolidays on admin/lessons GET:", seedErr);
      }
    }

    const lessonsSql = `SELECT
        l.id,
        l.group_id,
        ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
        l.duration_min,
        l.status,
        l.location_id,
        l.teacher_id,
        l.schedule_template_id,
        g.name AS group_name,
        COALESCE(loc.name, '') AS location_name,
        CASE WHEN t.id IS NULL THEN NULL ELSE TRIM(CONCAT(t.first_name, ' ', t.last_name)) END AS teacher_name
      FROM lessons l
      INNER JOIN groups g ON g.id = l.group_id
      LEFT JOIN locations loc ON loc.id = l.location_id
      LEFT JOIN users t ON t.id = l.teacher_id
      WHERE ${lessonWhere.join(" AND ")}
      ORDER BY l.scheduled_at ASC`;

    const holidaysSql = `SELECT
        h.id,
        h.school_id,
        h.name,
        h.date_from::text,
        h.date_to::text,
        h.type,
        COALESCE(h.applies_to_preschool, FALSE) AS applies_to_preschool,
        COALESCE(h.applies_to_school, FALSE) AS applies_to_school,
        COALESCE(
          (SELECT array_agg(shg.group_id ORDER BY shg.group_id)
           FROM school_holiday_groups shg
           WHERE shg.holiday_id = h.id),
          '{}'
        ) AS group_ids
      FROM school_holidays h
      WHERE ${holidayWhere.join(" AND ")}
      ORDER BY h.date_from ASC`;

    const [lessonsRes, holidaysRes] = await Promise.all([
      queryDb<{
        id: string;
        group_id: string;
        scheduled_at: Date | string;
        duration_min: number;
        status: string;
        location_id: string;
        teacher_id: string;
        schedule_template_id: string | null;
        group_name: string;
        location_name: string;
        teacher_name: string | null;
      }>(lessonsSql, lessonParams),
      queryDb<{
        id: string;
        school_id: string;
        name: string;
        date_from: string;
        date_to: string;
        type: string;
        group_ids: string[] | null;
        applies_to_preschool: boolean;
        applies_to_school: boolean;
      }>(holidaysSql, holidayParams),
    ]);

    const lessons = lessonsRes.rows.map((row) => ({
      id: row.id,
      group_id: row.group_id,
      scheduled_at: toIsoUtc(row.scheduled_at),
      duration_min: row.duration_min,
      status: row.status,
      location_id: row.location_id,
      teacher_id: row.teacher_id,
      schedule_template_id: row.schedule_template_id,
      group_name: row.group_name,
      location_name: row.location_name,
      teacher_name: row.teacher_name,
    }));

    const allScopedGroupIds = [
      ...new Set(holidaysRes.rows.flatMap((row) => normalizeGroupIds(row.group_ids))),
    ];
    const groupKindById = new Map<string, HolidayFacilityKind>();
    if (allScopedGroupIds.length > 0) {
      const groupsRes = await queryDb<{
        id: string;
        name: string;
        level: string | null;
        location_id: string | null;
        location_facility: string | null;
        location_name: string | null;
        location_is_special: boolean | null;
      }>(
        `SELECT g.id, g.name, g.level, g.location_id,
                loc.facility AS location_facility,
                loc.name AS location_name,
                loc.is_special AS location_is_special
         FROM groups g
         LEFT JOIN locations loc ON loc.id = g.location_id
         WHERE g.id = ANY($1::text[])`,
        [allScopedGroupIds],
      );
      for (const g of groupsRes.rows) {
        groupKindById.set(
          g.id,
          classifyGroupFacilityKindForHoliday({
            level: g.level,
            name: g.name,
            location_id: g.location_id,
            location_facility: g.location_facility,
            location_name: g.location_name,
            location_is_special: g.location_is_special,
          }),
        );
      }
    }

    const holidays: Array<{
      id: string;
      name: string;
      date_from: string;
      date_to: string;
      type: string;
      group_ids: string[];
      applies_to_all_groups: boolean;
      scope: HolidayCalendarScope;
      audience_label: string | null;
    }> = holidaysRes.rows.map((row) => {
      const gids = normalizeGroupIds(row.group_ids);
      const kinds = gids.map((id) => groupKindById.get(id) ?? "unknown");
      const appliesToPreschool = Boolean(row.applies_to_preschool);
      const appliesToSchool = Boolean(row.applies_to_school);
      const scope = resolveHolidayCalendarScope({
        type: row.type,
        groupIds: gids,
        groupKinds: kinds,
        appliesToPreschool,
        appliesToSchool,
      });
      return {
        id: row.id,
        name: row.name,
        date_from: String(row.date_from).slice(0, 10),
        date_to: String(row.date_to).slice(0, 10),
        type: row.type,
        group_ids: gids,
        applies_to_all_groups:
          (appliesToPreschool && appliesToSchool) ||
          (!appliesToPreschool && !appliesToSchool && gids.length === 0),
        scope,
        audience_label: holidayAudienceLabel(scope),
      };
    });

    const coveredDates = new Set<string>();
    for (const h of holidays) {
      let ymd = h.date_from;
      while (ymd <= h.date_to) {
        coveredDates.add(ymd);
        const [y, m, d] = ymd.split("-").map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        ymd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
      }
    }
    for (const h of listPolishPublicHolidays(fromYmd, toYmd)) {
      if (coveredDates.has(h.date)) continue;
      holidays.push({
        id: `pl-public-${h.date}`,
        name: h.name,
        date_from: h.date,
        date_to: h.date,
        type: "PUBLIC",
        group_ids: [],
        applies_to_all_groups: true,
        scope: "all",
        audience_label: null,
      });
    }
    holidays.sort((a, b) => a.date_from.localeCompare(b.date_from));

    return NextResponse.json({ lessons, holidays, timezone: TZ });
  } catch (error) {
    console.error("GET admin/lessons error:", error);
    return NextResponse.json({ message: "Błąd pobierania zajęć" }, { status: 500 });
  }
}
