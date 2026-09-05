import { NextRequest, NextResponse } from "next/server";
import { sendCombinedProposalEmail } from "@/lib/email";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  resolveProposalEmailCredentials,
  saveEnrollmentProposalDraft,
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
    const sendEmail = (body as { sendEmail?: unknown }).sendEmail !== false;
    const allowEmptyPrices = (body as { allowEmptyPrices?: unknown }).allowEmptyPrices === true;
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

    /** Tylko zapis grupy/stawek — bez zmiany statusu i bez maila. */
    if (!sendEmail) {
      for (const p of proposals) {
        const result = await saveEnrollmentProposalDraft(
          {
            requestId: p.requestId!,
            groupId: p.groupId!,
            lessonUnitPrice: p.lessonUnitPrice,
            monthlyUnitPrice: p.monthlyUnitPrice,
            yearlyUnitPrice: p.yearlyUnitPrice,
          },
          {
            ...schoolRestrict,
            allowEmptyPrices,
          }
        );
        if (!result.ok) {
          return NextResponse.json({ message: result.message }, { status: result.status });
        }
      }
      return NextResponse.json({
        message: "Zapisano dane i dodano dziecko do grupy (niepotwierdzone — bez wysyłki e-mail)",
        saved: true,
        count: proposals.length,
      });
    }

    let sharedParent: SharedParentState | null = null;
    const emailItems: ProposalEmailItem[] = [];
    let complimentaryCompleted = false;

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
      if (result.complimentaryCompleted) complimentaryCompleted = true;
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
      login,
      { complimentaryCompleted }
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
