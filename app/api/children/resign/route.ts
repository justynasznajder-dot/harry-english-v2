import { NextRequest, NextResponse } from "next/server";
import { getChildById, getUserById, requestChildResignation } from "@/lib/db";
import { sendResignationEmail } from "@/lib/email";
import { getTokenFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

    const { childId, reason } = await request.json();
    if (!childId || !reason?.trim()) {
      return NextResponse.json({ message: "Brakuje wymaganych danych (childId, reason)" }, { status: 400 });
    }

    const child = await getChildById(childId);
    if (!child || child.parent_id !== userId) {
      return NextResponse.json({ message: "Dziecko nie zostało znalezione lub nie należy do użytkownika" }, { status: 404 });
    }

    const success = await requestChildResignation(childId, userId, reason.trim());
    if (!success) {
      return NextResponse.json({ message: "Nie udało się zaktualizować rezygnacji" }, { status: 500 });
    }

    const user = await getUserById(userId);
    if (user) {
      try {
        await sendResignationEmail(
          user.first_name,
          user.last_name,
          user.email,
          child.first_name,
          child.last_name,
          child.id,
          reason.trim()
        );
      } catch (emailError) {
        console.error("Error sending resignation email:", emailError);
      }
    }

    return NextResponse.json({ message: "Rezygnacja została zgłoszona pomyślnie", success: true });
  } catch (error) {
    console.error("Error in child resign endpoint:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas przetwarzania rezygnacji" }, { status: 500 });
  }
}
