import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import {
  getActiveSchoolYear,
  getParentProfileByUserId,
  getRegistrationSchoolId,
  getUserById,
  queryDb,
} from "@/lib/db";
import {
  computeEnrollmentContractReadiness,
  fetchParentEnrollmentPipelineStatuses,
} from "@/lib/enrollment-contract-readiness";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import { ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE } from "@/lib/enrollment-status";
import { normalizePaymentType } from "@/lib/lesson-pricing";
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
  isParentContractProfileComplete,
  resolveBillingTypeFromProfile,
} from "@/lib/parent-contract-profile";
import { isComplimentaryForParent } from "@/lib/school-discounts";

/**
 * Rodzic potwierdza uzupełnienie danych do umowy.
 * ACCEPTED → AWAITING_CONTRACT, potem automatycznie generuje pierwszą umowę (SENT).
 */
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
        { message: "Tryb bez opłat — dane do umowy nie są wymagane." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      paymentType?: unknown;
      payment_type?: unknown;
      paymentTypeByRequestId?: unknown;
      payment_type_by_request_id?: unknown;
      includedRequestIds?: unknown;
      included_request_ids?: unknown;
    };

    const paymentTypeByRequestIdRaw =
      body.paymentTypeByRequestId && typeof body.paymentTypeByRequestId === "object"
        ? (body.paymentTypeByRequestId as Record<string, unknown>)
        : body.payment_type_by_request_id &&
            typeof body.payment_type_by_request_id === "object"
          ? (body.payment_type_by_request_id as Record<string, unknown>)
          : {};

    const profile = await getParentProfileByUserId(parentId);
    if (!profile || !isParentContractProfileComplete(profile)) {
      return NextResponse.json(
        { message: "Najpierw zapisz kompletne dane do umowy." },
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
          message: readiness.hasPendingDecisions
            ? ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
              ? "Najpierw rozstrzygnij wszystkie propozycje grup (akceptacja lub kontakt ze szkołą)."
              : "Poczekaj, aż szkoła przypisze grupę do wszystkich otwartych zgłoszeń."
            : readiness.acceptedCount === 0
              ? "Brak dzieci z przypisaną grupą — nie ma czego zgłaszać do umowy."
              : "Nie można przygotować umowy w tym stanie.",
        },
        { status: 409 }
      );
    }

    const updated = await queryDb<{ id: string }>(
      `UPDATE enrollment_requests
       SET status = 'AWAITING_CONTRACT'
       WHERE school_id = $1
         AND user_id = $2
         AND UPPER(BTRIM(COALESCE(status::text, ''))) IN (${
           ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
             ? "'ACCEPTED'"
             : "'ACCEPTED', 'PROPOSED'"
         })
       RETURNING id`,
      [SCHOOL_ID, parentId]
    );

    for (const row of updated.rows) {
      await syncChildrenAccessLevelForEnrollment(row.id, "AWAITING_CONTRACT");
    }
    await syncParentUserAccessLevel(parentId);

    const children = await fetchParentEnrollmentChildren(parentId, SCHOOL_ID);
    const queueRequestIds = Array.isArray(body.includedRequestIds)
      ? body.includedRequestIds.map((id) => String(id).trim()).filter(Boolean)
      : Array.isArray(body.included_request_ids)
        ? body.included_request_ids.map((id) => String(id).trim()).filter(Boolean)
        : children
            .filter((c) => String(c.access_level).toUpperCase() === "AWAITING_CONTRACT")
            .map((c) => c.request_id);

    const validation = validateParentContractSelection(children, queueRequestIds);
    if (!validation.ok) {
      return NextResponse.json(
        {
          message: validation.message,
          updatedCount: updated.rows.length,
          contractGenerated: false,
        },
        { status: 409 }
      );
    }

    const nextChild = await findNextChildNeedingContract(
      parentId,
      SCHOOL_ID,
      children,
      queueRequestIds
    );
    const single = validateSingleChildForContract(nextChild);
    if (!single.ok) {
      const activeYear = await getActiveSchoolYear(SCHOOL_ID);
      if (!activeYear?.id) {
        return NextResponse.json(
          {
            message:
              "Brak aktywnego roku szkolnego — skontaktuj się ze szkołą. Bez niego nie można wygenerować umowy.",
            updatedCount: updated.rows.length,
            contractGenerated: false,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          message: single.message,
          updatedCount: updated.rows.length,
          contractGenerated: false,
        },
        { status: 409 }
      );
    }

    const paymentType =
      normalizePaymentType(
        String(
          paymentTypeByRequestIdRaw[single.child.request_id] ??
            body.paymentType ??
            body.payment_type ??
            ""
        )
          .trim()
          .toUpperCase()
      ) ?? null;
    if (!paymentType) {
      return NextResponse.json(
        {
          message: `Wybierz sposób rozliczeń dla: ${single.child.first_name} ${single.child.last_name}`,
        },
        { status: 400 }
      );
    }

    const included = [single.child];
    const includeAttachment2 = resolveIncludeAttachment2FromGroups(included);
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
      message: remainingQueue
        ? `Umowa wygenerowana dla ${single.child.first_name} ${single.child.last_name}. Podpisz ją, a potem wygenerujesz umowę dla kolejnego dziecka.`
        : "Umowa wygenerowana. Zapoznaj się z dokumentami i podpisz.",
      updatedCount: updated.rows.length,
      contractGenerated: true,
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
    console.error("POST /api/enrollment/contract-data/submit:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Nie udało się zgłosić danych do umowy";
    const status =
      message.includes("Brak") ||
      message.includes("już podpisana") ||
      message.includes("po kolei")
        ? 409
        : 500;
    return NextResponse.json({ message }, { status });
  }
}
