import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, resolveAdminPanelTenant } from "@/lib/db";
import { sendCombinedProposalEmail } from "@/lib/email";
import { getTokenFromRequest } from "@/lib/auth";
import {
  resolveProposalEmailCredentials,
  submitEnrollmentProposal,
  type ProposalEmailItem,
  type SharedParentState,
} from "@/lib/admin-enrollment-proposal";

type BatchProposalBody = {
  requestId?: string;
  groupId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;

    const body = await request.json();
    const proposals = (body as { proposals?: BatchProposalBody[] }).proposals;
    if (!Array.isArray(proposals) || proposals.length < 2) {
      return NextResponse.json(
        { message: "Wysyłka zbiorcza wymaga co najmniej dwóch propozycji" },
        { status: 400 }
      );
    }

    for (const p of proposals) {
      if (!p.requestId || !p.groupId) {
        return NextResponse.json({ message: "Brak wymaganych pól w propozycji" }, { status: 400 });
      }
    }

    const requestIds = proposals.map((p) => p.requestId!);
    const schoolRestrict =
      tenant.role === "MANAGER" ? { restrictToSchoolId: tenant.tenantSchoolId } : undefined;

    let sharedParent: SharedParentState | null = null;
    const emailItems: ProposalEmailItem[] = [];

    for (const p of proposals) {
      const result = await submitEnrollmentProposal(
        {
          requestId: p.requestId!,
          groupId: p.groupId!,
        },
        sharedParent,
        schoolRestrict
      );
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: result.status });
      }

      sharedParent = result.sharedParent;
      emailItems.push(result.emailItem);
    }

    if (!sharedParent) {
      return NextResponse.json({ message: "Nie udało się przetworzyć propozycji" }, { status: 500 });
    }

    const credentials = await resolveProposalEmailCredentials({
      parentUserId: sharedParent.parentUserId,
      parentEmail: sharedParent.parentEmail,
      parentCreated: sharedParent.parentCreated,
      tempPasswordFromCreate: sharedParent.tempPassword,
      excludeRequestIds: requestIds,
    });

    await sendCombinedProposalEmail(
      sharedParent.parentEmail,
      `${sharedParent.parentFirstName} ${sharedParent.parentLastName}`.trim(),
      emailItems,
      credentials
    );

    return NextResponse.json({
      message: sharedParent.parentCreated
        ? "Propozycje zostały wysłane w jednym mailu, konto rodzica utworzone"
        : "Propozycje zostały wysłane w jednym mailu",
      parentCreated: sharedParent.parentCreated,
      parentId: sharedParent.parentUserId,
      count: emailItems.length,
    });
  } catch (error) {
    console.error("Admin enrollment batch POST error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji zbiorczej" }, { status: 500 });
  }
}
