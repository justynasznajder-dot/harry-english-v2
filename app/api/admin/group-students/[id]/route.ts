import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { updateChildPriceOverrides } from "@/lib/enrollment-sync";
import { parsePriceDecimal } from "@/lib/lesson-pricing";
import { normalizeLessonsPerWeek } from "@/lib/lessons-per-week";

function parseOptionalPrice(
  raw: unknown,
  label: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const value = parsePriceDecimal(raw as string | number);
  if (value == null) return { ok: false, message: `Nieprawidłowa ${label}` };
  return { ok: true, value };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const body = await request.json();
    const hasLessonsPerWeek = body.lessonsPerWeek !== undefined;
    const hasPriceField =
      body.lessonUnitPrice !== undefined ||
      body.monthlyUnitPrice !== undefined ||
      body.yearlyUnitPrice !== undefined;

    if (!hasLessonsPerWeek && !hasPriceField) {
      return NextResponse.json({ message: "Brak pól do aktualizacji" }, { status: 400 });
    }

    const membership = await queryDb<{
      child_id: string;
      group_lessons_per_week: number | null;
    }>(
      `SELECT gs.child_id, g.lessons_per_week AS group_lessons_per_week
       FROM group_students gs
       JOIN groups g ON g.id = gs.group_id
       WHERE gs.id = $1
         AND g.school_id = $2
         AND gs.left_at IS NULL
       LIMIT 1`,
      [id, ctx.schoolId]
    );
    if (!membership.rows[0]) {
      return tenantNotFoundResponse("Nie znaleziono aktywnego ucznia w grupie");
    }

    let updatedLessonsPerWeek: number | null = null;
    if (hasLessonsPerWeek) {
      const groupLpw =
        normalizeLessonsPerWeek(membership.rows[0].group_lessons_per_week) ?? 1;
      if (groupLpw <= 1) {
        return NextResponse.json(
          {
            message:
              "Frekwencję 1×/2× można zmieniać tylko w grupie z zajęciami 2× w tygodniu",
          },
          { status: 400 }
        );
      }
      const lpw = normalizeLessonsPerWeek(body.lessonsPerWeek);
      if (lpw == null) {
        return NextResponse.json(
          { message: "Podaj lessonsPerWeek (1 lub 2)" },
          { status: 400 }
        );
      }
      await queryDb(
        `UPDATE group_students SET lessons_per_week = $2 WHERE id = $1`,
        [id, lpw]
      );
      // Synchronizuj frekwencję na zgłoszeniu — rodzic/umowa biorą ten sam termin.
      await queryDb(
        `UPDATE enrollment_requests er
         SET lessons_per_week = $2
         FROM children c
         WHERE c.id = $1
           AND er.id = c.enrollment_request_id
           AND er.school_id = $3`,
        [membership.rows[0].child_id, lpw, ctx.schoolId]
      );
      updatedLessonsPerWeek = lpw;
    }

    if (hasPriceField) {
      const lessonParsed = parseOptionalPrice(
        body.lessonUnitPrice,
        "stawka za pojedyncze zajęcia"
      );
      if (!lessonParsed.ok) {
        return NextResponse.json({ message: lessonParsed.message }, { status: 400 });
      }
      const monthlyParsed = parseOptionalPrice(body.monthlyUnitPrice, "stawka ratalna");
      if (!monthlyParsed.ok) {
        return NextResponse.json({ message: monthlyParsed.message }, { status: 400 });
      }
      const yearlyParsed = parseOptionalPrice(body.yearlyUnitPrice, "stawka jednorazowa");
      if (!yearlyParsed.ok) {
        return NextResponse.json({ message: yearlyParsed.message }, { status: 400 });
      }

      const prices: {
        lessonUnitPrice?: number | null;
        monthlyUnitPrice?: number | null;
        yearlyUnitPrice?: number | null;
      } = {};
      if (body.lessonUnitPrice !== undefined) prices.lessonUnitPrice = lessonParsed.value;
      if (body.monthlyUnitPrice !== undefined) prices.monthlyUnitPrice = monthlyParsed.value;
      if (body.yearlyUnitPrice !== undefined) prices.yearlyUnitPrice = yearlyParsed.value;

      const ok = await updateChildPriceOverrides(
        membership.rows[0].child_id,
        ctx.schoolId,
        prices
      );
      if (!ok) {
        return tenantNotFoundResponse("Nie znaleziono aktywnego ucznia w grupie");
      }
    }

    return NextResponse.json({
      message: hasLessonsPerWeek
        ? updatedLessonsPerWeek === 1
          ? "Oznaczono frekwencję 1× w tygodniu"
          : "Oznaczono frekwencję 2× w tygodniu"
        : "Stawki zaktualizowane",
      lessonsPerWeek: updatedLessonsPerWeek,
    });
  } catch (error) {
    console.error("PATCH group-student error:", error);
    return NextResponse.json({ message: "Błąd aktualizacji ucznia w grupie" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const res = await queryDb<{ id: string }>(
      `UPDATE group_students gs
       SET left_at = NOW()
       FROM groups g
       WHERE gs.id = $1
         AND gs.group_id = g.id
         AND g.school_id = $2
         AND gs.left_at IS NULL
       RETURNING gs.id`,
      [id, ctx.schoolId]
    );
    if (!res.rows[0]) {
      return tenantNotFoundResponse("Nie znaleziono aktywnego ucznia w grupie");
    }
    return NextResponse.json({ message: "Uczeń został usunięty z grupy" });
  } catch (error) {
    console.error("DELETE group-student error:", error);
    return NextResponse.json({ message: "Błąd usuwania ucznia z grupy" }, { status: 500 });
  }
}
