import { NextRequest, NextResponse } from "next/server";
import { sendCombinedProposalEmail } from "@/lib/email";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  resolveProposalEmailCredentials,
  saveEnrollmentProposalDraft,
  saveEnrollmentRequestPrices,
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

function hasAllPriceInputs(p: BatchProposalBody): boolean {
  const vals = [p.lessonUnitPrice, p.monthlyUnitPrice, p.yearlyUnitPrice];
  return vals.every((v) => v != null && String(v).trim() !== "");
}

function hasComplimentaryPriceInputs(p: BatchProposalBody): boolean {
  return (
    p.monthlyUnitPrice != null &&
    String(p.monthlyUnitPrice).trim() !== "" &&
    p.yearlyUnitPrice != null &&
    String(p.yearlyUnitPrice).trim() !== ""
  );
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = await request.json();
    const proposals = (body as { proposals?: BatchProposalBody[] }).proposals;
    const sendEmail = (body as { sendEmail?: unknown }).sendEmail !== false;
    const allowEmptyPrices = (body as { allowEmptyPrices?: unknown }).allowEmptyPrices === true;
    const complimentaryMode = (body as { complimentaryMode?: unknown }).complimentaryMode === true;
    if (!Array.isArray(proposals) || proposals.length < 1) {
      return NextResponse.json(
        { message: "Wybierz co najmniej jedno dziecko do propozycji" },
        { status: 400 }
      );
    }

    const schoolRestrict =
      ctx.tenant.role === "MANAGER" ? { restrictToSchoolId: ctx.schoolId } : undefined;

    /** Tylko zapis grupy/stawek — bez zmiany statusu i bez maila. */
    if (!sendEmail) {
      for (const p of proposals) {
        if (!p.requestId) {
          return NextResponse.json({ message: "Brak wymaganych pól w propozycji" }, { status: 400 });
        }
        const groupId = typeof p.groupId === "string" ? p.groupId.trim() : "";
        if (!groupId) {
          if (complimentaryMode) {
            if (!hasComplimentaryPriceInputs(p)) {
              return NextResponse.json(
                { message: "Podaj stawkę jednorazową i ratalną dla każdego dziecka" },
                { status: 400 }
              );
            }
            const result = await saveEnrollmentRequestPrices(
              {
                requestId: p.requestId,
                lessonUnitPrice: null,
                monthlyUnitPrice: p.monthlyUnitPrice,
                yearlyUnitPrice: p.yearlyUnitPrice,
              },
              { ...schoolRestrict, complimentaryPrices: true }
            );
            if (!result.ok) {
              return NextResponse.json({ message: result.message }, { status: result.status });
            }
            continue;
          }
          if (!hasAllPriceInputs(p)) {
            return NextResponse.json(
              { message: "Podaj wszystkie 3 stawki albo wybierz grupę dla każdego dziecka" },
              { status: 400 }
            );
          }
          const result = await saveEnrollmentRequestPrices(
            {
              requestId: p.requestId,
              lessonUnitPrice: p.lessonUnitPrice,
              monthlyUnitPrice: p.monthlyUnitPrice,
              yearlyUnitPrice: p.yearlyUnitPrice,
            },
            schoolRestrict
          );
          if (!result.ok) {
            return NextResponse.json({ message: result.message }, { status: result.status });
          }
          continue;
        }

        if (complimentaryMode && !hasComplimentaryPriceInputs(p)) {
          return NextResponse.json(
            { message: "Podaj stawkę jednorazową i ratalną dla każdego dziecka" },
            { status: 400 }
          );
        }

        const result = await saveEnrollmentProposalDraft(
          {
            requestId: p.requestId,
            groupId,
            lessonUnitPrice: complimentaryMode ? null : p.lessonUnitPrice,
            monthlyUnitPrice: p.monthlyUnitPrice,
            yearlyUnitPrice: p.yearlyUnitPrice,
          },
          {
            ...schoolRestrict,
            allowEmptyPrices: allowEmptyPrices || complimentaryMode,
            complimentaryPrices: complimentaryMode,
          }
        );
        if (!result.ok) {
          return NextResponse.json({ message: result.message }, { status: result.status });
        }
      }
      const anyWithGroup = proposals.some(
        (p) => typeof p.groupId === "string" && p.groupId.trim().length > 0
      );
      return NextResponse.json({
        message: complimentaryMode
          ? anyWithGroup
            ? "Zapisano grupę i stawki (tryb bez opłat, bez e-maila)"
            : "Zapisano stawki (tryb bez opłat) — grupę możesz przypisać później"
          : anyWithGroup
            ? "Zapisano dane i dodano dziecko do grupy (niepotwierdzone — bez wysyłki e-mail)"
            : "Zapisano stawki (bez grupy — możesz uzupełnić później)",
        saved: true,
        count: proposals.length,
      });
    }

    for (const p of proposals) {
      if (!p.requestId || !(typeof p.groupId === "string" && p.groupId.trim())) {
        return NextResponse.json({ message: "Brak wymaganych pól w propozycji" }, { status: 400 });
      }
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
