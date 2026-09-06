import { NextRequest, NextResponse } from "next/server";
import {
  deleteChild,
  getChildByIdForSchool,
  queryDb,
  restoreChild,
  updateChild,
} from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { updateChildPriceOverrides } from "@/lib/enrollment-sync";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = await params;

    const childRes = await queryDb<{
      id: string;
      parent_id: string;
      first_name: string;
      last_name: string;
      birth_date: string;
      active: boolean;
      confirmed: boolean;
      client_number: string | null;
      lesson_unit_price: string | null;
      monthly_unit_price: string | null;
      yearly_unit_price: string | null;
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
      parent_client_number: string | null;
    }>(
      `SELECT
         c.id,
         c.parent_id,
         c.first_name,
         c.last_name,
         c.birth_date::text AS birth_date,
         c.active,
         c.confirmed,
         c.client_number,
         c.lesson_unit_price::text AS lesson_unit_price,
         c.monthly_unit_price::text AS monthly_unit_price,
         c.yearly_unit_price::text AS yearly_unit_price,
         u.first_name AS parent_first_name,
         u.last_name AS parent_last_name,
         u.email AS parent_email,
         u.client_number AS parent_client_number
       FROM children c
       JOIN users u ON u.id = c.parent_id
       WHERE c.id = $1 AND c.school_id = $2
       LIMIT 1`,
      [id, ctx.schoolId]
    );

    const child = childRes.rows[0];
    if (!child) return tenantNotFoundResponse("Dziecko nie zostało znalezione");

    const membershipRes = await queryDb<{
      id: string;
      group_id: string;
      group_name: string;
      group_price_monthly: string | null;
      group_price_yearly: string | null;
      group_price_per_lesson: string | null;
      lessons_per_week: number | null;
      group_lessons_per_week: number | null;
    }>(
      `SELECT
         gs.id,
         gs.group_id,
         g.name AS group_name,
         g.price_monthly::text AS group_price_monthly,
         g.price_yearly::text AS group_price_yearly,
         g.price_per_lesson::text AS group_price_per_lesson,
         gs.lessons_per_week,
         g.lessons_per_week AS group_lessons_per_week
       FROM group_students gs
       JOIN groups g ON g.id = gs.group_id
       WHERE gs.child_id = $1
         AND gs.left_at IS NULL
         AND g.school_id = $2
       ORDER BY gs.enrolled_at DESC
       LIMIT 1`,
      [id, ctx.schoolId]
    );

    const paymentRes = await queryDb<{
      payment_type: string | null;
      contract_id: string;
      status: string;
      signed_at: string | null;
    }>(
      `SELECT
         ct.payment_type,
         ct.id AS contract_id,
         ct.status,
         ct.signed_at::text AS signed_at
       FROM contracts ct
       JOIN contract_children cc ON cc.contract_id = ct.id AND cc.child_id = $1
       WHERE ct.school_id = $2
         AND ct.status = 'SIGNED'
       ORDER BY ct.signed_at DESC NULLS LAST, ct.created_at DESC
       LIMIT 1`,
      [id, ctx.schoolId]
    );

    const payment = paymentRes.rows[0] ?? null;

    return NextResponse.json({
      child,
      membership: membershipRes.rows[0] ?? null,
      payment: payment
        ? {
            payment_type: payment.payment_type,
            contract_id: payment.contract_id,
            status: payment.status,
            signed_at: payment.signed_at,
          }
        : null,
    });
  } catch (error) {
    console.error("Get child detail error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas pobierania dziecka" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.restore === true) {
      const restored = await restoreChild(id, ctx.schoolId);
      if (!restored) return tenantNotFoundResponse("Dziecko nie zostało znalezione");
      return NextResponse.json({ message: "Dziecko zostało przywrócone" });
    }

    const hasPriceField =
      body.lessonUnitPrice !== undefined ||
      body.monthlyUnitPrice !== undefined ||
      body.yearlyUnitPrice !== undefined;

    if (hasPriceField) {
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

      const prices: {
        lessonUnitPrice?: number | null;
        monthlyUnitPrice?: number | null;
        yearlyUnitPrice?: number | null;
      } = {};
      if (body.lessonUnitPrice !== undefined) prices.lessonUnitPrice = lessonParsed.value;
      if (body.monthlyUnitPrice !== undefined) prices.monthlyUnitPrice = monthlyParsed.value;
      if (body.yearlyUnitPrice !== undefined) prices.yearlyUnitPrice = yearlyParsed.value;

      const ok = await updateChildPriceOverrides(id, ctx.schoolId, prices);
      if (!ok) return tenantNotFoundResponse("Dziecko nie zostało znalezione");

      const child = await getChildByIdForSchool(id, ctx.schoolId);
      return NextResponse.json({ child, message: "Stawki zaktualizowane" });
    }

    const updated = await updateChild(id, ctx.schoolId, {
      first_name: body.first_name,
      last_name: body.last_name,
      birth_date: body.birth_date,
      active: body.active,
      confirmed: body.confirmed,
    });

    if (!updated) return tenantNotFoundResponse("Dziecko nie zostało znalezione");

    const child = await getChildByIdForSchool(id, ctx.schoolId);
    return NextResponse.json({ child, message: "Dziecko zostało zaktualizowane" });
  } catch (error) {
    console.error("Update child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas aktualizacji dziecka" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = await params;
    const deleted = await deleteChild(id, ctx.schoolId);
    if (!deleted) return tenantNotFoundResponse("Dziecko nie zostało znalezione");

    return NextResponse.json({ message: "Dziecko zostało oznaczone jako nieaktywne" });
  } catch (error) {
    console.error("Delete child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas usuwania dziecka" }, { status: 500 });
  }
}
