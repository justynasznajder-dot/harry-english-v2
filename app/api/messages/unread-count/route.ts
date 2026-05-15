import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { countUnreadMessagesForUser, requireMessageActor } from "@/lib/messages";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  try {
    const unreadCount = await countUnreadMessagesForUser({
      userId: actor.user.id,
      schoolId: actor.user.schoolId,
    });
    return NextResponse.json({ unreadCount });
  } catch (error) {
    console.error("GET /api/messages/unread-count error:", error);
    return NextResponse.json({ message: "Błąd pobierania licznika" }, { status: 500 });
  }
}
