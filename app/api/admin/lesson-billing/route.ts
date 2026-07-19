import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import {
  managerSchoolAndClause,
  requireAdminSchoolContext,
} from "@/lib/admin-school-context";
import { parsePriceDecimal } from "@/lib/lesson-pricing";

function parsePeriodMonth(raw: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  return `${value}-01`;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const periodMonth = parsePeriodMonth(request.nextUrl.searchParams.get("periodMonth"));
  if (!periodMonth) {
    return NextResponse.json({ message: "Podaj periodMonth w formacie YYYY-MM" }, { status: 400 });
  }

  const { clause: schoolClause, schoolId: managerSchoolId } = managerSchoolAndClause(
    ctx.tenant,
    "ch.school_id",
    2
  );
  const params: unknown[] = [periodMonth];
  if (managerSchoolId) params.push(managerSchoolId);

  try {
    const res = await queryDb<{
      child_id: string;
      parent_id: string;
      contract_id: string;
      first_name: string;
      last_name: string;
      parent_email: string;
      lesson_unit_price: string | null;
      group_price_per_lesson: string | null;
      billing_id: string | null;
      billing_status: string | null;
      billing_amount: string | null;
      billing_lessons_count: number | null;
      billing_payment_id: string | null;
      present_count: string;
      absent_count: string;
    }>(
      `SELECT
         ch.id AS child_id,
         ct.parent_id,
         ct.id AS contract_id,
         ch.first_name,
         ch.last_name,
         u.email AS parent_email,
         cc.lesson_unit_price::text AS lesson_unit_price,
         g.price_per_lesson::text AS group_price_per_lesson,
         lbp.id AS billing_id,
         lbp.status AS billing_status,
         lbp.amount::text AS billing_amount,
         lbp.lessons_count AS billing_lessons_count,
         lbp.payment_id AS billing_payment_id,
         COALESCE(att.present_count, '0') AS present_count,
         COALESCE(att.absent_count, '0') AS absent_count
       FROM contracts ct
       JOIN contract_children cc ON cc.contract_id = ct.id
       JOIN children ch ON ch.id = cc.child_id
       JOIN users u ON u.id = ct.parent_id
       LEFT JOIN groups g ON g.id = cc.group_id
       LEFT JOIN lesson_billing_periods lbp
         ON lbp.child_id = ch.id
        AND lbp.period_month = $1::date
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE a.status = 'PRESENT' OR a.status = 'LATE')::text AS present_count,
           COUNT(*) FILTER (WHERE a.status = 'ABSENT')::text AS absent_count
         FROM attendance a
         JOIN lessons l ON l.id = a.lesson_id
         WHERE a.child_id = ch.id
           AND l.group_id = cc.group_id
           AND l.status IN ('SCHEDULED', 'COMPLETED')
           AND DATE_TRUNC('month', l.scheduled_at) = $1::date
       ) att ON TRUE
       WHERE ct.payment_type = 'PER_LESSON'
         AND ct.status = 'SIGNED'
         AND ch.active = TRUE
         ${schoolClause}
       ORDER BY ch.last_name, ch.first_name`,
      params
    );

    return NextResponse.json({
      periodMonth: periodMonth.slice(0, 7),
      rows: res.rows.map((row) => ({
        childId: row.child_id,
        parentId: row.parent_id,
        contractId: row.contract_id,
        firstName: row.first_name,
        lastName: row.last_name,
        parentEmail: row.parent_email,
        lessonUnitPrice: row.lesson_unit_price ?? row.group_price_per_lesson,
        billing: row.billing_id
          ? {
              id: row.billing_id,
              status: row.billing_status,
              amount: row.billing_amount,
              lessonsCount: row.billing_lessons_count,
              paymentId: row.billing_payment_id,
            }
          : null,
        attendanceSummary: {
          present: Number(row.present_count) || 0,
          absent: Number(row.absent_count) || 0,
        },
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/lesson-billing:", error);
    return NextResponse.json({ message: "Błąd pobierania rozliczeń" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const childId = String(body.childId ?? "").trim();
    const parentId = String(body.parentId ?? "").trim();
    const contractId = String(body.contractId ?? "").trim() || null;
    const periodMonth = parsePeriodMonth(String(body.periodMonth ?? ""));
    const amount = parsePriceDecimal(body.amount);
    const lessonsCount =
      body.lessonsCount != null && body.lessonsCount !== ""
        ? Number(body.lessonsCount)
        : null;
    const unitPrice = parsePriceDecimal(body.unitPrice);
    const status = String(body.status ?? "DRAFT").trim().toUpperCase();
    const notes = body.notes != null ? String(body.notes).trim() : null;

    if (!childId || !parentId || !periodMonth) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }
    if (amount == null || amount <= 0) {
      return NextResponse.json({ message: "Podaj poprawną kwotę" }, { status: 400 });
    }
    if (!["DRAFT", "APPROVED"].includes(status)) {
      return NextResponse.json({ message: "Nieprawidłowy status" }, { status: 400 });
    }

    const schoolId =
      ctx.tenant.role === "MANAGER"
        ? ctx.schoolId
        : (
            await queryDb<{ school_id: string }>(
              `SELECT school_id FROM children WHERE id = $1 LIMIT 1`,
              [childId]
            )
          ).rows[0]?.school_id;

    if (!schoolId) {
      return NextResponse.json({ message: "Nie znaleziono szkoły" }, { status: 404 });
    }

    const childScope = await queryDb<{ id: string }>(
      `SELECT id FROM children WHERE id = $1 AND school_id = $2 AND parent_id = $3 LIMIT 1`,
      [childId, schoolId, parentId]
    );
    if (!childScope.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono ucznia w tej szkole" }, { status: 404 });
    }

    const existing = await queryDb<{ id: string; status: string }>(
      `SELECT id, status FROM lesson_billing_periods
       WHERE child_id = $1 AND period_month = $2::date AND school_id = $3
       LIMIT 1`,
      [childId, periodMonth, schoolId]
    );

    if (existing.rows[0]?.status === "INVOICED" || existing.rows[0]?.status === "PAID") {
      return NextResponse.json(
        { message: "Rozliczenie zostało już zafakturowane" },
        { status: 409 }
      );
    }

    let billingId: string;
    if (existing.rows[0]) {
      billingId = existing.rows[0].id;
      await queryDb(
        `UPDATE lesson_billing_periods
         SET amount = $2,
             lessons_count = $3,
             unit_price = $4,
             status = $5,
             notes = $6,
             entered_by = $7,
             entered_at = NOW(),
             contract_id = COALESCE($8, contract_id)
         WHERE id = $1 AND school_id = $9`,
        [
          billingId,
          amount,
          lessonsCount,
          unitPrice,
          status,
          notes,
          ctx.userId,
          contractId,
          schoolId,
        ]
      );
    } else {
      const insertRes = await queryDb<{ id: string }>(
        `INSERT INTO lesson_billing_periods (
           school_id, child_id, parent_id, contract_id, period_month,
           lessons_count, amount, unit_price, status, entered_by, notes
         ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          schoolId,
          childId,
          parentId,
          contractId,
          periodMonth,
          lessonsCount,
          amount,
          unitPrice,
          status,
          ctx.userId,
          notes,
        ]
      );
      billingId = insertRes.rows[0]!.id;
    }

    return NextResponse.json({ message: "Rozliczenie zapisane", billingId });
  } catch (error) {
    console.error("POST /api/admin/lesson-billing:", error);
    return NextResponse.json({ message: "Błąd zapisu rozliczenia" }, { status: 500 });
  }
}
