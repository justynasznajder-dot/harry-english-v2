import { NextRequest, NextResponse } from "next/server";
import { sendCombinedProposalEmail } from "@/lib/email";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  resolveProposalEmailCredentials,
  submitEnrollmentProposal,
  type ProposalEmailItem,
  type SharedParentState,
} from "@/lib/admin-enrollment-proposal";

type BatchProposalBody = {
  requestId?: string;
  groupId?: string;
  lessonUnitPrice?: number | string | null;
  monthlyUnitPrice?: number | string | null;
  yearlyUnitPrice?: number | string | null;
};

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = await request.json();
    const proposals = (body as { proposals?: BatchProposalBody[] }).proposals;
    if (!Array.isArray(proposals) || proposals.length < 1) {
      return NextResponse.json(
        { message: "Wybierz co najmniej jedno dziecko do propozycji" },
        { status: 400 }
      );
    }

    for (const p of proposals) {
      if (!p.requestId || !p.groupId) {
        return NextResponse.json({ message: "Brak wymaganych pól w propozycji" }, { status: 400 });
      }
    }

    const schoolRestrict =
      ctx.tenant.role === "MANAGER" ? { restrictToSchoolId: ctx.schoolId } : undefined;

    let sharedParent: SharedParentState | null = null;
    const emailItems: ProposalEmailItem[] = [];

    for (const p of proposals) {
      const result = await submitEnrollmentProposal(
        {
          requestId: p.requestId!,
          groupId: p.groupId!,
          lessonUnitPrice: p.lessonUnitPrice,
          monthlyUnitPrice: p.monthlyUnitPrice,
          yearlyUnitPrice: p.yearlyUnitPrice,
        },
        sharedParent,
        {
          ...schoolRestrict,
          allowedStatuses: ["NEW"],
        }
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

    const login = resolveProposalEmailCredentials({
      parentEmail: sharedParent.parentEmail,
      parentCreated: sharedParent.parentCreated,
      tempPasswordFromCreate: sharedParent.tempPassword,
    });

    if (sharedParent.parentCreated && !login.tempPassword) {
      console.error(
        "Admin enrollment batch: parentCreated without temp password",
        sharedParent.parentUserId
      );
      return NextResponse.json(
        { message: "Nie udało się przygotować danych logowania dla nowego konta" },
        { status: 500 }
      );
    }

    await sendCombinedProposalEmail(
      sharedParent.parentEmail,
      `${sharedParent.parentFirstName} ${sharedParent.parentLastName}`.trim(),
      emailItems,
      login
    );

    return NextResponse.json({
      message: sharedParent.parentCreated
        ? "Propozycja została wysłana wraz z danymi do logowania, konto rodzica utworzone"
        : "Propozycja została wysłana wraz z danymi do logowania",
      parentCreated: sharedParent.parentCreated,
      parentId: sharedParent.parentUserId,
      count: emailItems.length,
    });
  } catch (error) {
    console.error("Admin enrollment batch POST error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji zbiorczej" }, { status: 500 });
  }
}
