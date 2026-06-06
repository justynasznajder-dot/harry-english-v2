import { NextRequest, NextResponse } from "next/server";

import { getTokenFromRequest } from "@/lib/auth";

import {

  getParentProfileByUserId,

  getRegistrationSchoolId,

  getUserById,

} from "@/lib/db";

import {

  isParentContractProfileComplete,

  resolveBillingTypeFromProfile,

} from "@/lib/parent-contract-profile";

import {
  fetchParentEnrollmentChildren,
  generateParentContract,
  validateParentContractSelection,
} from "@/lib/parent-contract";
import {
  computeEnrollmentContractReadiness,
  fetchParentEnrollmentPipelineStatuses,
} from "@/lib/enrollment-contract-readiness";
import { isComplimentaryForParent } from "@/lib/school-discounts";



export async function POST(request: NextRequest) {

  const payload = await getTokenFromRequest(request);

  const parentId = payload?.userId ?? null;

  if (!parentId) {

    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

  }



  const SCHOOL_ID = getRegistrationSchoolId();



  try {

    const user = await getUserById(parentId);

    if (!user || user.role !== "PARENT") {

      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });

    }

    if (!user.school_id) {

      return NextResponse.json({ message: "Konto nie ma przypisanej szkoły" }, { status: 400 });

    }

    const complimentary = await isComplimentaryForParent(user.school_id, {
      parentId: user.id,
      parentEmail: user.email,
    });
    if (complimentary) {
      return NextResponse.json(
        { message: "Tryb bez opłat — umowa nie jest wymagana. Zapis kończy się po akceptacji grupy." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const includedRequestIds = Array.isArray(body.includedRequestIds)

      ? body.includedRequestIds.map((id: unknown) => String(id).trim()).filter(Boolean)

      : Array.isArray(body.included_request_ids)

        ? body.included_request_ids.map((id: unknown) => String(id).trim()).filter(Boolean)

        : [];

    const paymentType = String(body.paymentType ?? body.payment_type ?? "")

      .trim()

      .toUpperCase();

    const includeAttachment2 = Boolean(

      body.includeAttachment2 ?? body.include_attachment_2 ?? false

    );

    if (paymentType !== "MONTHLY" && paymentType !== "YEARLY") {

      return NextResponse.json(

        { message: "Wybierz sposób rozliczeń: miesięczny lub roczny" },

        { status: 400 }

      );

    }



    const profile = await getParentProfileByUserId(parentId);

    if (!profile || !isParentContractProfileComplete(profile)) {

      return NextResponse.json(

        { message: "Najpierw zapisz wspólne dane do umowy" },

        { status: 400 }

      );

    }



    const pipelineStatuses = await fetchParentEnrollmentPipelineStatuses(
      user.school_id,
      user.id,
      user.email
    );
    const readiness = computeEnrollmentContractReadiness(pipelineStatuses, false);
    if (!readiness.canPrepareContract) {
      return NextResponse.json(
        {
          message: readiness.allDecisionsResolved
            ? "Brak zaakceptowanych dzieci do umowy — wszystkie zgłoszenia zostały odrzucone."
            : "Umowę wygenerujesz dopiero gdy wszystkie dzieci będą zaakceptowane lub odrzucone przez szkołę.",
        },
        { status: 409 }
      );
    }

    const children = await fetchParentEnrollmentChildren(parentId, SCHOOL_ID);

    const validation = validateParentContractSelection(children, includedRequestIds);

    if (!validation.ok) {

      return NextResponse.json({ message: validation.message }, { status: 409 });

    }



    const includedSet = new Set(includedRequestIds);

    const included = children.filter(

      (c) =>

        includedSet.has(c.request_id) &&

        String(c.access_level).toUpperCase() === "ACCEPTED"

    );

    const excludedRequestIds = children
      .filter((c) => {
        const level = String(c.access_level).toUpperCase();
        if (includedSet.has(c.request_id)) return false;
        return ["ACCEPTED", "PROPOSED", "NEGOTIATING"].includes(level);
      })
      .map((c) => c.request_id);



    const billingType = resolveBillingTypeFromProfile(profile);

    const result = await generateParentContract(

      {

        parentId,

        schoolId: SCHOOL_ID,

        included,

        excludedRequestIds,

        paymentType: paymentType as "MONTHLY" | "YEARLY",

        includeAttachment2,

      },

      {

        address: String(profile.address ?? "").trim(),

        city: String(profile.city ?? "").trim(),

        zip_code: String(profile.zip_code ?? "").trim(),

        pesel: profile.pesel ? String(profile.pesel).trim() : null,

        company_name: profile.company_name ? String(profile.company_name).trim() : null,

        nip: profile.nip ? String(profile.nip).trim() : null,

      },

      {

        first_name: user.first_name,

        last_name: user.last_name,

        phone: user.phone,

        email: user.email,

      },

      billingType

    );



    return NextResponse.json({

      contractId: result.contractId,

      status: "SENT",

      contract: {

        id: result.contractId,

        content_html: result.contentHtml,

        attachment_1_html: result.attachment1Html,

        attachment_2_html: result.attachment2Html,

        include_attachment_2: includeAttachment2,

        status: "SENT",

        amount: result.amount,

        paymentType,

        includedRequestIds,

      },

    });

  } catch (error) {

    console.error("POST /api/parent/contract/generate:", error);

    const message =

      error instanceof Error ? error.message : "Nie udało się wygenerować umowy";

    const status = message.includes("Brak") || message.includes("już podpisana") ? 409 : 500;

    return NextResponse.json({ message }, { status });

  }

}


