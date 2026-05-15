import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { queryDb } from "@/lib/db";
import {
  fetchThreadMessages,
  getThreadRootId,
  requireMessageActor,
  roleLabelPl,
  userCanAccessThreadRoot,
} from "@/lib/messages";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  const { id } = await params;
  const rootId = await getThreadRootId(id);
  if (!rootId) {
    return NextResponse.json({ message: "Nie znaleziono wiadomości" }, { status: 404 });
  }

  const canAccess = await userCanAccessThreadRoot(actor.user.id, rootId);
  if (!canAccess) {
    return NextResponse.json({ message: "Brak dostępu do wątku" }, { status: 403 });
  }

  try {
    const messages = await fetchThreadMessages(rootId);

    await queryDb(
      `UPDATE messages SET read_at = NOW()
       WHERE recipient_id = $1
         AND read_at IS NULL
         AND (id = $2 OR parent_message_id = $2)`,
      [actor.user.id, rootId]
    );

    return NextResponse.json({
      thread: messages.map((m) => ({
        id: m.id,
        parentMessageId: m.parent_message_id,
        subject: m.subject,
        content: m.content,
        senderId: m.sender_id,
        recipientId: m.recipient_id,
        senderRole: m.sender_role,
        readAt: m.read_at,
        createdAt: m.created_at,
        sender: {
          id: m.sender_id,
          firstName: m.sender_first_name,
          lastName: m.sender_last_name,
          role: m.sender_role_col,
          roleLabel: roleLabelPl(m.sender_role_col),
        },
        recipient: {
          id: m.recipient_id,
          firstName: m.recipient_first_name,
          lastName: m.recipient_last_name,
          role: m.recipient_role_col,
        },
      })),
    });
  } catch (error) {
    console.error("GET /api/messages/[id]/thread error:", error);
    return NextResponse.json({ message: "Błąd pobierania wątku" }, { status: 500 });
  }
}
