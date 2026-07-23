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
  findNextChildNeedingContract,
  findNextQueuedChildWithoutContract,
  generateParentContract,
  resolveIncludeAttachment2FromGroups,
  validateParentContractSelection,
  validateSingleChildForContract,
} from "@/lib/parent-contract";
import {
  computeEnrollmentContractReadiness,
  fetchParentEnrollmentPipelineStatuses,
} from "@/lib/enrollment-contract-readiness";
import { normalizePaymentType } from "@/lib/lesson-pricing";
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
        {
          message:
            "Tryb bez opłat — umowa nie jest wymagana. Zapis kończy się po akceptacji grupy.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const queueRequestIds = Array.isArray(body.includedRequestIds)
      ? body.includedRequestIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : Array.isArray(body.included_request_ids)
        ? body.included_request_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
        : [];

    const paymentTypeRaw = String(body.paymentType ?? body.payment_type ?? "")
      .trim()
      .toUpperCase();
    const paymentType = normalizePaymentType(paymentTypeRaw);
    if (!paymentType) {
      return NextResponse.json(
        { message: "Wybierz sposób rozliczeń: ratalny, jednorazowy lub za pojedyncze zajęcia" },
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
    const validation = validateParentContractSelection(children, queueRequestIds);
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 409 });
    }

    const nextChild = await findNextChildNeedingContract(
      parentId,
      SCHOOL_ID,
      children,
      queueRequestIds
    );
    const single = validateSingleChildForContract(nextChild);
    if (!single.ok) {
      return NextResponse.json({ message: single.message }, { status: 409 });
    }

    const included = [single.child];
    const includeAttachment2 = resolveIncludeAttachment2FromGroups(included);

    // Nie odrzucamy pozostałych dzieci z kolejki — umowy generujemy po kolei.
    const billingType = resolveBillingTypeFromProfile(profile);

    const result = await generateParentContract(
      {
        parentId,
        schoolId: SCHOOL_ID,
        included,
        excludedRequestIds: [],
        paymentType,
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

    const remainingQueue = await findNextQueuedChildWithoutContract(
      parentId,
      SCHOOL_ID,
      children,
      queueRequestIds,
      single.child.child_id
    );

    return NextResponse.json({
      contractId: result.contractId,
      status: "SENT",
      nextChildToContract: remainingQueue
        ? {
            child_id: remainingQueue.child_id,
            request_id: remainingQueue.request_id,
            first_name: remainingQueue.first_name,
            last_name: remainingQueue.last_name,
          }
        : null,
      contract: {
        id: result.contractId,
        content_html: result.contentHtml,
        child_attachments: result.childAttachments,
        include_attachment_2: includeAttachment2,
        status: "SENT",
        amount: result.amount,
        paymentType,
        includedRequestIds: [single.child.request_id],
        child_id: single.child.child_id,
      },
    });
  } catch (error) {
    console.error("POST /api/parent/contract/generate:", error);
    const message =
      error instanceof Error ? error.message : "Nie udało się wygenerować umowy";
    const status =
      message.includes("Brak") ||
      message.includes("już podpisana") ||
      message.includes("po kolei")
        ? 409
        : 500;
    return NextResponse.json({ message }, { status });
  }
}
