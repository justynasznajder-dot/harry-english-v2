import { NextRequest, NextResponse } from "next/server";
import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import { queryDb } from "@/lib/db";
import { resolveBillingTypeFromProfile } from "@/lib/parent-contract-profile";

export async function GET(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const schoolYearId = new URL(request.url).searchParams.get("schoolYearId")?.trim() || null;
  if (!schoolYearId) {
    return NextResponse.json({ message: "Podaj schoolYearId" }, { status: 400 });
  }

  try {
    const r = await queryDb<{
      contract_id: string;
      status: string;
      payment_type: string | null;
      amount: string | null;
      signed_at: Date | string | null;
      billing_exempt: boolean | null;
      parent_id: string;
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
      parent_client_number: string | null;
      company_name: string | null;
      nip: string | null;
      pesel: string | null;
      group_id: string | null;
      group_name: string | null;
      children_names: string | null;
    }>(
      `SELECT
         c.id AS contract_id,
         c.status,
         c.payment_type,
         c.amount::text AS amount,
         c.signed_at,
         c.billing_exempt,
         u.id AS parent_id,
         u.first_name AS parent_first_name,
         u.last_name AS parent_last_name,
         u.email AS parent_email,
         u.client_number AS parent_client_number,
         pp.company_name,
         pp.nip,
         pp.pesel,
         g.id AS group_id,
         g.name AS group_name,
         (
           SELECT string_agg(ch.first_name || ' ' || ch.last_name, ', ' ORDER BY ch.last_name, ch.first_name)
           FROM (
             SELECT cc.child_id
             FROM contract_children cc
             WHERE cc.contract_id = c.id
             UNION
             SELECT c.child_id
             WHERE c.child_id IS NOT NULL
           ) kids
           JOIN children ch ON ch.id = kids.child_id
         ) AS children_names
       FROM contracts c
       JOIN users u ON u.id = c.parent_id
       LEFT JOIN parent_profiles pp ON pp.user_id = u.id
       LEFT JOIN groups g ON g.id = c.group_id
       WHERE c.school_id = $1
         AND c.school_year_id = $2
         AND c.status = 'SIGNED'
       ORDER BY c.signed_at DESC NULLS LAST, u.last_name, u.first_name`,
      [ctx.schoolId, schoolYearId]
    );

    const clients = r.rows.map((row) => {
      const billingType = resolveBillingTypeFromProfile({
        company_name: row.company_name,
        nip: row.nip,
        pesel: row.pesel,
      });
      return {
        contractId: row.contract_id,
        status: row.status,
        paymentType: row.payment_type,
        amount: row.amount != null ? Number(row.amount) : null,
        signedAt: row.signed_at ? String(row.signed_at) : null,
        billingExempt: Boolean(row.billing_exempt),
        billingType,
        parent: {
          id: row.parent_id,
          firstName: row.parent_first_name,
          lastName: row.parent_last_name,
          email: row.parent_email,
          clientNumber: row.parent_client_number,
          companyName: row.company_name,
          nip: row.nip,
        },
        group: row.group_id
          ? { id: row.group_id, name: row.group_name }
          : null,
        childrenNames: row.children_names ?? "",
      };
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("GET /api/accountant/clients:", error);
    return NextResponse.json({ message: "Błąd pobierania klientów" }, { status: 500 });
  }
}
