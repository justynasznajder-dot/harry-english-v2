import { NextRequest, NextResponse } from "next/server";
import { getParentProfileByUserId, getRegistrationSchoolId, getUserById } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import {
  findNextChildNeedingContract,
  findNextQueuedChildWithoutContract,
  generateParentContract,
  resolveIncludeAttachment2FromGroups,
  validateParentContractSelection,
  validateSingleChildForContract,
  type ParentContractChildRow,
} from "@/lib/parent-contract";
import { isParentContractProfileComplete, resolveBillingTypeFromProfile } from "@/lib/parent-contract-profile";
import { fetchParentRenewalContractChildren } from "@/lib/renewal-contract";
import { getPlannedNextSchoolYear } from "@/lib/school-year-planning";
import { normalizePaymentType } from "@/lib/lesson-pricing";
import { isComplimentaryForParent } from "@/lib/school-discounts";

export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const schoolId = getRegistrationSchoolId();

  try {
    const user = await getUserById(parentId);
    if (!user || user.role !== "PARENT") {
      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
    }

    const complimentary = await isComplimentaryForParent(schoolId, {
      parentId: user.id,
      parentEmail: user.email,
    });
    if (complimentary) {
      return NextResponse.json(
        { message: "Tryb bez opłat — umowa nie jest wymagana." },
        { status: 403 }
      );
    }

    const planned = await getPlannedNextSchoolYear(schoolId);
    if (!planned) {
      return NextResponse.json(
        { message: "Szkoła nie ma jeszcze planowanego kolejnego roku szkolnego." },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      includedRenewalIds?: unknown;
      paymentType?: unknown;
    };
    const includedRenewalIds = Array.isArray(body.includedRenewalIds)
      ? body.includedRenewalIds.map((id) => String(id).trim()).filter(Boolean)
      : undefined;

    const paymentTypeRaw = String(body.paymentType ?? "MONTHLY").trim().toUpperCase();
    const paymentType = normalizePaymentType(paymentTypeRaw);
    if (!paymentType) {
      return NextResponse.json({ message: "Niepoprawny sposób rozliczeń" }, { status: 400 });
    }

    const profile = await getParentProfileByUserId(parentId);
    if (!profile || !isParentContractProfileComplete(profile)) {
      return NextResponse.json(
        { message: "Najpierw zapisz wspólne dane do umowy w procesie zapisu" },
        { status: 400 }
      );
    }

    const children = await fetchParentRenewalContractChildren(
      parentId,
      schoolId,
      includedRenewalIds
    );
    const queueIds =
      includedRenewalIds ?? children.map((c) => c.renewal_id);
    const validation = validateParentContractSelection(children, queueIds);
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 409 });
    }

    // Mapowanie renewal_id → request_id dla kolejki findNextChildNeedingContract
    const asEnrollmentShape: ParentContractChildRow[] = children.map((c) => ({
      ...c,
      request_id: c.renewal_id,
    }));

    const nextChild = await findNextChildNeedingContract(
      parentId,
      schoolId,
      asEnrollmentShape,
      queueIds
    );
    const single = validateSingleChildForContract(nextChild);
    if (!single.ok) {
      return NextResponse.json({ message: single.message }, { status: 409 });
    }

    const included = [single.child];
    const includeAttachment2 = resolveIncludeAttachment2FromGroups(included);
    const billingType = resolveBillingTypeFromProfile(profile);

    const result = await generateParentContract(
      {
        parentId,
        schoolId,
        included,
        excludedRequestIds: [],
        paymentType,
        includeAttachment2,
        schoolYearOverride: { id: planned.id, name: planned.name },
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

    const remaining = await findNextQueuedChildWithoutContract(
      parentId,
      schoolId,
      asEnrollmentShape,
      queueIds,
      single.child.child_id
    );

    return NextResponse.json({
      success: true,
      contractId: result.contractId,
      season: planned.name,
      nextChildToContract: remaining
        ? {
            child_id: remaining.child_id,
            request_id: remaining.request_id,
            first_name: remaining.first_name,
            last_name: remaining.last_name,
          }
        : null,
    });
  } catch (error) {
    console.error("Renewal contract generate error:", error);
    const message = error instanceof Error ? error.message : "Nie udało się wygenerować umowy";
    return NextResponse.json({ message }, { status: 500 });
  }
}
