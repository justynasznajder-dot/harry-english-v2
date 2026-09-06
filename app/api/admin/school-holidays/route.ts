import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSchoolYear,
  queryDb,
} from "@/lib/db";
import {
  requireAdminSchoolContext,
  resolveInsertSchoolId,
} from "@/lib/admin-school-context";
import { ensurePolishPublicHolidaysForSchoolYear } from "@/lib/ensure-polish-public-holidays";
import { topUpLessonsAfterHolidayDeletion } from "@/lib/lesson-generation";
import { notifyParents, type ParentNotifyRow } from "@/lib/parent-notifications";
import { requireMessageActor } from "@/lib/messages";
import { deleteScheduledLessonsInHolidayRange } from "@/lib/school-holiday-lessons";

const HOLIDAY_TYPES = ["HOLIDAY", "PUBLIC", "SCHOOL", "CANCELLED"] as const;

function formatDatePl(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

async function getParentsWithScheduledLessonsInRange(
  schoolId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ParentNotifyRow[]> {
  const res = await queryDb<ParentNotifyRow>(
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

/** Z pola formularza / JSON: YYYY-MM-DD lub DD.MM.RRRR → YYYY-MM-DD */
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

/** Granice roku z wiersza PG (string YYYY-MM-DD lub Date — na wypadek innych zapytań). */
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

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { searchParams } = new URL(request.url);
    const schoolYearId = searchParams.get("school_year_id");

    if (schoolYearId && ctx.schoolId) {
      try {
        const seed = await ensurePolishPublicHolidaysForSchoolYear({
          schoolId: ctx.schoolId,
          schoolYearId,
        });
        if (seed && seed.deletedByGroup.length > 0) {
          await topUpLessonsAfterHolidayDeletion(ctx.schoolId, seed.deletedByGroup);
        }
      } catch (seedErr) {
        console.error("ensurePolishPublicHolidays on school-holidays GET:", seedErr);
      }
    }

    const withYearManager = `SELECT h.id, h.school_id, h.school_year_id, h.name, h.date_from::text, h.date_to::text, h.type, h.created_at
           FROM school_holidays h
           INNER JOIN school_years sy ON sy.school_id = h.school_id AND sy.id = $2 AND sy.school_id = $1
           WHERE h.date_from <= sy.date_to
             AND h.date_to >= sy.date_from
             AND (
               h.school_year_id IS NULL
               OR h.school_year_id = sy.id
             )
           ORDER BY h.date_from ASC`;

    const withYearAdmin = `SELECT h.id, h.school_id, h.school_year_id, h.name, h.date_from::text, h.date_to::text, h.type, h.created_at
           FROM school_holidays h
           INNER JOIN school_years sy ON sy.school_id = h.school_id AND sy.id = $1
           WHERE h.date_from <= sy.date_to
             AND h.date_to >= sy.date_from
             AND (
               h.school_year_id IS NULL
               OR h.school_year_id = sy.id
             )
           ORDER BY h.date_from ASC`;

    const r = await queryDb<{
      id: string;
      school_id: string;
      school_year_id: string | null;
      name: string;
      date_from: string;
      date_to: string;
      type: string;
      created_at: Date;
    }>(
      schoolYearId
        ? ctx.tenant.role === "MANAGER"
          ? withYearManager
          : withYearAdmin
        : ctx.tenant.role === "MANAGER"
          ? `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays
           WHERE school_id = $1
           ORDER BY date_from DESC`
          : `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays
           ORDER BY date_from DESC`,
      schoolYearId
        ? ctx.tenant.role === "MANAGER"
          ? [ctx.schoolId, schoolYearId]
          : [schoolYearId]
        : ctx.tenant.role === "MANAGER"
          ? [ctx.schoolId]
          : []
    );

    const holidays = r.rows.map((row) => ({
      ...row,
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
    }));

    return NextResponse.json({ holidays });
  } catch (error) {
    console.error("GET school-holidays error:", error);
    return NextResponse.json({ message: "Błąd pobierania dni wolnych" }, { status: 500 });
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
      type = "HOLIDAY",
      notify_parents: notifyParentsRaw,
      parent_message,
      school_id: bodySchoolId,
      schoolId: bodySchoolIdCamel,
    } = body as {
      name?: string;
      date_from?: string;
      date_to?: string;
      type?: string;
      notify_parents?: boolean;
      parent_message?: string;
      school_id?: string;
      schoolId?: string;
    };
    const shouldNotifyParents = notifyParentsRaw === true;
    if (!name?.trim() || !date_from || !date_to) {
      return NextResponse.json({ message: "Brak nazwy lub zakresu dat" }, { status: 400 });
    }
    if (!HOLIDAY_TYPES.includes(type as (typeof HOLIDAY_TYPES)[number])) {
      return NextResponse.json({ message: "Nieprawidłowy typ (HOLIDAY, PUBLIC, SCHOOL, CANCELLED)" }, { status: 400 });
    }

    const df = normalizeRequestYmd(date_from);
    const dt = normalizeRequestYmd(date_to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      return NextResponse.json({ message: "Nieprawidłowy format dat (oczekiwane RRRR-MM-DD)" }, { status: 400 });
    }
    if (df > dt) {
      return NextResponse.json({ message: "Data „od” nie może być późniejsza niż „do”" }, { status: 400 });
    }

    const insertSchoolId = resolveInsertSchoolId(ctx.tenant, { bodySchoolId, bodySchoolIdCamel });
    if (!insertSchoolId) {
      return NextResponse.json(
        { message: "Brak identyfikatora szkoły (school_id / schoolId lub SCHOOL_ID w środowisku)" },
        { status: 400 }
      );
    }

    const active = await getActiveSchoolYear(insertSchoolId);
    if (!active) {
      return NextResponse.json({ message: "Brak aktywnego roku szkolnego" }, { status: 400 });
    }

    const yFrom = ymdFromDbValue((active as { date_from: unknown }).date_from);
    const yTo = ymdFromDbValue((active as { date_to: unknown }).date_to);
    const yearId = String((active as { id: string }).id);

    if (!yFrom || !yTo || df < yFrom || dt > yTo) {
      return NextResponse.json(
        { message: `Dzień wolny poza zakresem aktywnego roku szkolnego (${yFrom} — ${yTo})` },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const parentsToNotify = shouldNotifyParents
      ? await getParentsWithScheduledLessonsInRange(insertSchoolId, df, dt)
      : [];

    let messageActor: Awaited<ReturnType<typeof requireMessageActor>> | null = null;
    if (shouldNotifyParents && parentsToNotify.length > 0) {
      messageActor = await requireMessageActor(ctx.userId);
      if (!messageActor.ok) {
        return NextResponse.json({ message: messageActor.message }, { status: messageActor.status });
      }
    }

    const ins = await queryDb(
      `INSERT INTO school_holidays (id, school_id, school_year_id, name, date_from, date_to, type, created_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, NOW())
       RETURNING id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at`,
      [id, insertSchoolId, yearId, name.trim(), df, dt, type]
    );
    const row = ins.rows[0] as Record<string, unknown>;
    const deletion = await deleteScheduledLessonsInHolidayRange(insertSchoolId, df, dt);
    const topUp = await topUpLessonsAfterHolidayDeletion(insertSchoolId, deletion.byGroup);

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

    let message = "Dodano dzień wolny.";
    if (deletion.deleted > 0) {
      message += ` Usunięto ${deletion.deleted} zaplanowanych zajęć w tym okresie.`;
    }
    if (topUp.created > 0) {
      message += ` Uzupełniono ${topUp.created} brakując${
        topUp.created === 1 ? "e zajęcie" : topUp.created < 5 ? "e zajęcia" : "ych zajęć"
      } (${topUp.groupsProcessed} grup).`;
    } else if (deletion.deleted > 0 && topUp.groupsProcessed === 0) {
      message += " Nie uzupełniono kalendarza (brak potwierdzonego harmonogramu lub nauczyciela).";
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
      },
      lessonsCancelled: deletion.deleted,
      lessonsDeleted: deletion.deleted,
      lessonsRegenerated: topUp.created,
      groupsToppedUp: topUp.groupsProcessed,
      parentsNotified,
      emailsSent,
      emailsFailed,
      message,
    });
  } catch (error) {
    console.error("POST school-holidays error:", error);
    return NextResponse.json({ message: "Błąd dodawania dnia wolnego" }, { status: 500 });
  }
}
