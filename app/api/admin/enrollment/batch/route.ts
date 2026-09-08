import { NextRequest, NextResponse } from "next/server";
import { sendCombinedProposalEmail } from "@/lib/email";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { queryDb } from "@/lib/db";
import { completeComplimentaryEnrollment } from "@/lib/complimentary-enrollment";
import { isEnrollmentProposalEmailEnabled } from "@/lib/enrollment-proposal-email";
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
  discountPercent?: number | string | null;
};

function hasAllPriceInputs(p: BatchProposalBody): boolean {
  const vals = [p.lessonUnitPrice, p.monthlyUnitPrice, p.yearlyUnitPrice];
  return vals.every((v) => v != null && String(v).trim() !== "");
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
            const result = await saveEnrollmentRequestPrices(
              {
                requestId: p.requestId,
                lessonUnitPrice: p.lessonUnitPrice,
                monthlyUnitPrice: p.monthlyUnitPrice,
                yearlyUnitPrice: p.yearlyUnitPrice,
                discountPercent: p.discountPercent,
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
              discountPercent: p.discountPercent,
            },
            schoolRestrict
          );
          if (!result.ok) {
            return NextResponse.json({ message: result.message }, { status: result.status });
          }
          continue;
        }

        const result = await saveEnrollmentProposalDraft(
          {
            requestId: p.requestId,
            groupId,
            lessonUnitPrice: p.lessonUnitPrice,
            monthlyUnitPrice: p.monthlyUnitPrice,
            yearlyUnitPrice: p.yearlyUnitPrice,
            discountPercent: p.discountPercent,
          },
          {
            ...schoolRestrict,
            allowEmptyPrices: allowEmptyPrices && !complimentaryMode,
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
            ? "Zapisano grupę i stawki (tryb bez umowy, bez e-maila)"
            : "Zapisano stawki (tryb bez umowy) — grupę możesz przypisać później"
          : anyWithGroup
            ? "Zapisano dane i dodano dziecko do grupy (niepotwierdzone — bez wysyłki e-mail)"
            : "Zapisano stawki",
        saved: true,
        count: proposals.length,
      });
    }

    const requestIds = proposals
      .map((p) => (typeof p.requestId === "string" ? p.requestId.trim() : ""))
      .filter(Boolean);
    if (requestIds.length > 0) {
      const schoolsRes = await queryDb<{ school_id: string }>(
        `SELECT DISTINCT school_id
         FROM enrollment_requests
         WHERE id = ANY($1::text[])`,
        [requestIds]
      );
      if (
        schoolsRes.rows.some((row) => !isEnrollmentProposalEmailEnabled(row.school_id))
      ) {
        return NextResponse.json(
          {
            message:
              "Wysyłka maila z propozycją i danymi logowania jest wyłączona dla tej szkoły. Użyj „Zapisz”.",
          },
          { status: 403 }
        );
      }
    }

    for (const p of proposals) {
      if (!p.requestId || !(typeof p.groupId === "string" && p.groupId.trim())) {
        return NextResponse.json({ message: "Brak wymaganych pól w propozycji" }, { status: 400 });
      }
    }

    let sharedParent: SharedParentState | null = null;
    const emailItems: ProposalEmailItem[] = [];
    const complimentaryToComplete: Array<{
      requestId: string;
      parentUserId: string;
      schoolId: string;
    }> = [];

    // PROPOSED: retry po częściowym sukcesie (np. PDF zgody na odbiór padł przed COMPLETED).
    const allowedStatuses = complimentaryMode ? (["NEW", "PROPOSED"] as const) : (["NEW"] as const);

    for (const p of proposals) {
      const result = await submitEnrollmentProposal(
        {
          requestId: p.requestId!,
          groupId: p.groupId!,
          lessonUnitPrice: p.lessonUnitPrice,
          monthlyUnitPrice: p.monthlyUnitPrice,
          yearlyUnitPrice: p.yearlyUnitPrice,
          discountPercent: p.discountPercent,
        },
        sharedParent,
        {
          ...schoolRestrict,
          allowedStatuses: [...allowedStatuses],
          complimentaryPrices: complimentaryMode,
        }
      );
      if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: result.status });
      }

      sharedParent = result.sharedParent;
      emailItems.push(result.emailItem);
      if (result.complimentaryCompleted) {
        complimentaryToComplete.push({
          requestId: p.requestId!,
          parentUserId: result.sharedParent.parentUserId,
          schoolId: result.sharedParent.schoolId,
        });
      }
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

    const complimentaryCompleted = complimentaryToComplete.length > 0;

    await sendCombinedProposalEmail(
      sharedParent.parentEmail,
      `${sharedParent.parentFirstName} ${sharedParent.parentLastName}`.trim(),
      emailItems,
      login,
      { complimentaryCompleted }
    );

    for (const item of complimentaryToComplete) {
      try {
        await completeComplimentaryEnrollment(
          item.requestId,
          item.parentUserId,
          item.schoolId
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : "nieznany błąd";
        console.error("completeComplimentaryEnrollment after email failed:", err);
        return NextResponse.json(
          {
            message: `Mail wysłany, ale zapis nie dokończył się (${detail}). Otwórz zgłoszenie i kliknij ponownie „Wyślij maila”.`,
          },
          { status: 500 }
        );
      }
    }

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
    const detail = error instanceof Error ? error.message.trim() : "";
    return NextResponse.json(
      {
        message: detail
          ? `Błąd wysyłania propozycji zbiorczej: ${detail}`
          : "Błąd wysyłania propozycji zbiorczej",
      },
      { status: 500 }
    );
  }
}
