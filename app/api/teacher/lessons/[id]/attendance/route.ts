import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { isLektor, queryDb } from "@/lib/db";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { sqlSchoolTimestampAsTimestamptz, toIsoUtc } from "@/lib/school-timezone";

const ATTENDANCE_STATUSES = new Set(["PRESENT", "ABSENT", "EXCUSED", "LATE"]);

async function ensureTeacherOwnsLesson(userId: string, lessonId: string): Promise<boolean> {
  const res = await queryDb<{ id: string }>(
    `SELECT l.id
     FROM lessons l
     JOIN groups g ON g.id = l.group_id
     WHERE l.id = $1 AND g.teacher_id = $2
     LIMIT 1`,
    [lessonId, userId]
  );
  return Boolean(res.rows[0]);
}

/** Dziecko ma podpisaną umowę PER_LESSON dla tej grupy (lub bez powiązania grupy). */
async function childIsBilledPerLesson(
  childId: string,
  groupId: string
): Promise<boolean> {
  const res = await queryDb<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM contracts ct
       JOIN contract_children cc ON cc.contract_id = ct.id
       WHERE cc.child_id = $1
         AND ct.payment_type = 'PER_LESSON'
         AND ct.status = 'SIGNED'
         AND ct.billing_exempt = FALSE
         AND (cc.group_id IS NULL OR cc.group_id = $2)
     ) AS ok`,
    [childId, groupId]
  );
  return res.rows[0]?.ok === true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
  }
  if (!(await isLektor(userId))) {
    return NextResponse.json({ message: "Brak uprawnień lektora" }, { status: 403 });
  }

  const { id: lessonId } = await params;
  if (!(await ensureTeacherOwnsLesson(userId, lessonId))) {
    return NextResponse.json({ message: "Brak dostępu do lekcji" }, { status: 403 });
  }

  try {
    await completePastScheduledLessons();

    const lessonRes = await queryDb<{
      id: string;
      group_id: string;
      group_name: string;
      scheduled_at: Date | string;
      status: string;
      location_name: string | null;
    }>(
      `SELECT l.id,
              l.group_id,
              g.name AS group_name,
              ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
              l.status::text AS status,
              loc.name AS location_name
       FROM lessons l
       JOIN groups g ON g.id = l.group_id
       LEFT JOIN locations loc ON loc.id = l.location_id
       WHERE l.id = $1
       LIMIT 1`,
      [lessonId]
    );
    const lesson = lessonRes.rows[0];
    if (!lesson) {
      return NextResponse.json({ message: "Nie znaleziono lekcji" }, { status: 404 });
    }

    const studentsRes = await queryDb<{
      child_id: string;
      first_name: string;
      last_name: string;
      status: string | null;
      note: string | null;
      billed_per_lesson: boolean;
    }>(
      `SELECT
         c.id AS child_id,
         c.first_name,
         c.last_name,
         a.status::text AS status,
         a.note,
         EXISTS (
           SELECT 1
           FROM contracts ct
           JOIN contract_children cc ON cc.contract_id = ct.id
           WHERE cc.child_id = c.id
             AND ct.payment_type = 'PER_LESSON'
             AND ct.status = 'SIGNED'
             AND ct.billing_exempt = FALSE
             AND (cc.group_id IS NULL OR cc.group_id = gs.group_id)
         ) AS billed_per_lesson
       FROM group_students gs
       JOIN children c ON c.id = gs.child_id
       LEFT JOIN attendance a ON a.lesson_id = $1 AND a.child_id = c.id
       WHERE gs.group_id = $2
         AND gs.left_at IS NULL
         AND c.active = TRUE
       ORDER BY c.last_name, c.first_name`,
      [lessonId, lesson.group_id]
    );

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        groupId: lesson.group_id,
        groupName: lesson.group_name,
        scheduledAt: toIsoUtc(lesson.scheduled_at),
        status: lesson.status,
        locationName: lesson.location_name,
      },
      attendance: studentsRes.rows.map((row) => {
        const billedPerLesson = row.billed_per_lesson === true;
        return {
          childId: row.child_id,
          firstName: row.first_name,
          lastName: row.last_name,
          billedPerLesson,
          // Obecność rozliczeniowa tylko dla PER_LESSON; reszta bez statusu do oznaczania.
          status: billedPerLesson ? (row.status ?? "PRESENT") : row.status,
          note: row.note,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/teacher/lessons/[id]/attendance:", error);
    return NextResponse.json({ message: "Błąd pobierania obecności" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
  }
  if (!(await isLektor(userId))) {
    return NextResponse.json({ message: "Brak uprawnień lektora" }, { status: 403 });
  }

  const { id: lessonId } = await params;
  if (!(await ensureTeacherOwnsLesson(userId, lessonId))) {
    return NextResponse.json({ message: "Brak dostępu do lekcji" }, { status: 403 });
  }

  try {
    await completePastScheduledLessons();

    const body = await request.json();
    const entries = Array.isArray(body.attendance) ? body.attendance : [];
    if (entries.length === 0) {
      return NextResponse.json({ message: "Brak danych obecności" }, { status: 400 });
    }

    const lessonRes = await queryDb<{ group_id: string }>(
      `SELECT group_id FROM lessons WHERE id = $1 LIMIT 1`,
      [lessonId]
    );
    const groupId = lessonRes.rows[0]?.group_id;
    if (!groupId) {
      return NextResponse.json({ message: "Nie znaleziono lekcji" }, { status: 404 });
    }

    let saved = 0;
    let skipped = 0;

    for (const entry of entries) {
      const childId = String(entry.childId ?? entry.child_id ?? "").trim();
      const status = String(entry.status ?? "PRESENT").trim().toUpperCase();
      const note = entry.note != null ? String(entry.note).trim() : null;
      if (!childId || !ATTENDANCE_STATUSES.has(status)) continue;

      const memberRes = await queryDb<{ id: string }>(
        `SELECT gs.id
         FROM group_students gs
         WHERE gs.group_id = $1 AND gs.child_id = $2 AND gs.left_at IS NULL
         LIMIT 1`,
        [groupId, childId]
      );
      if (!memberRes.rows[0]) continue;

      if (!(await childIsBilledPerLesson(childId, groupId))) {
        skipped += 1;
        continue;
      }

      await queryDb(
        `INSERT INTO attendance (lesson_id, child_id, status, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lesson_id, child_id)
         DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note`,
        [lessonId, childId, status, note]
      );
      saved += 1;
    }

    if (saved === 0) {
      return NextResponse.json(
        {
          message:
            skipped > 0
              ? "Brak dzieci z rozliczeniem za pojedyncze zajęcia do zapisania"
              : "Brak danych obecności do zapisania",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Obecności zapisane",
      saved,
      skipped,
    });
  } catch (error) {
    console.error("PUT /api/teacher/lessons/[id]/attendance:", error);
    return NextResponse.json({ message: "Błąd zapisu obecności" }, { status: 500 });
  }
}
