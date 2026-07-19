import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

const TZ = "Europe/Warsaw";
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

function toIso(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "string") return v;
  return String(v);
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
    `l.scheduled_at >= ($1::date AT TIME ZONE '${TZ}')`,
    `l.scheduled_at < (($2::date + interval '1 day') AT TIME ZONE '${TZ}')`,
  ];
  let p = 3;
  if (ctx.tenant.role === "MANAGER") {
    lessonWhere.push(`g.school_id = $${p}`);
    lessonParams.push(ctx.schoolId);
    p++;
  }
  if (locationIds.length > 0) {
    lessonWhere.push(`l.location_id = ANY($${p}::text[])`);
    lessonParams.push(locationIds);
    p++;
  }
  if (teacherIds.length > 0) {
    lessonWhere.push(`l.teacher_id = ANY($${p}::text[])`);
    lessonParams.push(teacherIds);
    p++;
  }
  if (groupIds.length > 0) {
    lessonWhere.push(`l.group_id = ANY($${p}::text[])`);
    lessonParams.push(groupIds);
    p++;
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

    const lessonsSql = `SELECT
        l.id,
        l.group_id,
        l.scheduled_at,
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

    const holidaysSql = `SELECT h.id, h.name, h.date_from::text, h.date_to::text, h.type
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
        name: string;
        date_from: string;
        date_to: string;
        type: string;
      }>(holidaysSql, holidayParams),
    ]);

    const lessons = lessonsRes.rows.map((row) => ({
      id: row.id,
      group_id: row.group_id,
      scheduled_at: toIso(row.scheduled_at),
      duration_min: row.duration_min,
      status: row.status,
      location_id: row.location_id,
      teacher_id: row.teacher_id,
      schedule_template_id: row.schedule_template_id,
      group_name: row.group_name,
      location_name: row.location_name,
      teacher_name: row.teacher_name,
    }));

    const holidays = holidaysRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
      type: row.type,
    }));

    return NextResponse.json({ lessons, holidays, timezone: TZ });
  } catch (error) {
    console.error("GET admin/lessons error:", error);
    return NextResponse.json({ message: "Błąd pobierania zajęć" }, { status: 500 });
  }
}
