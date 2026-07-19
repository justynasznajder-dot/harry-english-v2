import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { parsePriceDecimal } from "@/lib/lesson-pricing";

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
    const lessonParsed = parseOptionalPrice(body.lessonUnitPrice, "stawka za pojedyncze zajęcia");
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

    const hasAnyField =
      body.lessonUnitPrice !== undefined ||
      body.monthlyUnitPrice !== undefined ||
      body.yearlyUnitPrice !== undefined;
    if (!hasAnyField) {
      return NextResponse.json({ message: "Brak pól do aktualizacji" }, { status: 400 });
    }

    const sets: string[] = [];
    const values: unknown[] = [id, ctx.schoolId];
    let idx = 3;
    if (body.lessonUnitPrice !== undefined) {
      sets.push(`gs.lesson_unit_price = $${idx++}`);
      values.push(lessonParsed.value);
    }
    if (body.monthlyUnitPrice !== undefined) {
      sets.push(`gs.monthly_unit_price = $${idx++}`);
      values.push(monthlyParsed.value);
    }
    if (body.yearlyUnitPrice !== undefined) {
      sets.push(`gs.yearly_unit_price = $${idx++}`);
      values.push(yearlyParsed.value);
    }

    const res = await queryDb<{ id: string }>(
      `UPDATE group_students gs
       SET ${sets.join(", ")}
       FROM groups g
       WHERE gs.id = $1
         AND gs.group_id = g.id
         AND g.school_id = $2
         AND gs.left_at IS NULL
       RETURNING gs.id`,
      values
    );
    if (!res.rows[0]) {
      return tenantNotFoundResponse("Nie znaleziono aktywnego ucznia w grupie");
    }
    return NextResponse.json({ message: "Stawki zaktualizowane" });
  } catch (error) {
    console.error("PATCH group-student error:", error);
    return NextResponse.json({ message: "Błąd aktualizacji stawek" }, { status: 500 });
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
