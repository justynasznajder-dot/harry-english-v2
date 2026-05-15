import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { sendMessageNotificationEmail } from "@/lib/email";
import { queryDb, runPgTransaction } from "@/lib/db";
import {
  fetchThreadRoots,
  getThreadRootId,
  getUsersForEmail,
  insertMessages,
  requireMessageActor,
  resolveParentIdForMessage,
  userCanAccessThreadRoot,
  validateRecipientsForSender,
} from "@/lib/messages";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20));
  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  try {
    const { threads, total } = await fetchThreadRoots({
      userId: actor.user.id,
      schoolId: actor.user.schoolId,
      page,
      limit,
      search,
    });

    return NextResponse.json({
      threads: threads.map((t) => ({
        id: t.id,
        subject: t.subject,
        content: t.content,
        senderId: t.sender_id,
        recipientId: t.recipient_id,
        senderRole: t.sender_role,
        broadcastId: t.broadcast_id,
        readAt: t.read_at,
        createdAt: t.created_at,
        replyCount: parseInt(t.reply_count, 10) || 0,
        lastReplyAt: t.last_reply_at,
        sender: {
          id: t.sender_id,
          firstName: t.sender_first_name,
          lastName: t.sender_last_name,
          role: t.sender_role_col,
        },
        recipient: {
          id: t.recipient_id,
          firstName: t.recipient_first_name,
          lastName: t.recipient_last_name,
          role: t.recipient_role_col,
        },
      })),
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("GET /api/messages error:", error);
    return NextResponse.json({ message: "Błąd pobierania wiadomości" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  let body: {
    recipientIds?: unknown;
    subject?: unknown;
    content?: unknown;
    parentMessageId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Nieprawidłowe dane" }, { status: 400 });
  }

  const recipientIds = Array.isArray(body.recipientIds)
    ? body.recipientIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const parentMessageId =
    typeof body.parentMessageId === "string" && body.parentMessageId.length > 0
      ? body.parentMessageId
      : null;

  if (!subject || !content) {
    return NextResponse.json({ message: "Temat i treść są wymagane" }, { status: 400 });
  }

  let threadRootId: string | null = null;
  if (parentMessageId) {
    threadRootId = await getThreadRootId(parentMessageId);
    if (!threadRootId) {
      return NextResponse.json({ message: "Nie znaleziono wątku" }, { status: 404 });
    }
    const canAccess = await userCanAccessThreadRoot(actor.user.id, threadRootId);
    if (!canAccess) {
      return NextResponse.json({ message: "Brak dostępu do wątku" }, { status: 403 });
    }
  }

  let effectiveRecipientIds = recipientIds;
  if (parentMessageId && threadRootId) {
    const rootRes = await queryDb<{ sender_id: string; recipient_id: string }>(
      `SELECT sender_id, recipient_id FROM messages WHERE id = $1 LIMIT 1`,
      [threadRootId]
    );
    const root = rootRes.rows[0];
    if (!root) {
      return NextResponse.json({ message: "Nie znaleziono wątku" }, { status: 404 });
    }
    const otherParty =
      root.sender_id === actor.user.id ? root.recipient_id : root.sender_id;
    effectiveRecipientIds = [otherParty];
  }

  const validation = await validateRecipientsForSender({
    senderId: actor.user.id,
    senderRole: actor.user.role,
    schoolId: actor.user.schoolId,
    recipientIds: effectiveRecipientIds,
    threadRootId,
  });
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message }, { status: 403 });
  }

  const uniqueRecipients = [...new Set(effectiveRecipientIds)];
  const broadcastId = uniqueRecipients.length > 1 ? randomUUID() : null;
  const isNewThread = !parentMessageId;

  const recipientUsers = await getUsersForEmail(uniqueRecipients);
  const recipientMap = new Map(recipientUsers.map((u) => [u.id, u]));

  try {
    const messageIds = await runPgTransaction(async (client) => {
      const rows = uniqueRecipients.map((recipientId) => {
        const recipient = recipientMap.get(recipientId);
        const parentId = resolveParentIdForMessage(
          actor.user.role,
          recipient?.role ?? "PARENT",
          actor.user.id,
          recipientId
        );
        return {
          schoolId: actor.user.schoolId,
          parentId,
          senderId: actor.user.id,
          senderRole: actor.user.role,
          recipientId,
          subject,
          content,
          parentMessageId: threadRootId,
          broadcastId,
        };
      });
      return insertMessages(client, rows);
    });

    const shouldSendEmail =
      isNewThread &&
      (actor.user.role === "MANAGER" || actor.user.role === "TEACHER");

    if (shouldSendEmail) {
      const senderName = `${actor.user.firstName} ${actor.user.lastName}`.trim();
      const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.harry-english.pl";

      for (let i = 0; i < uniqueRecipients.length; i++) {
        const recipientId = uniqueRecipients[i];
        const messageId = messageIds[i];
        const recipient = recipientMap.get(recipientId);
        if (!recipient?.email) continue;
        if (recipient.role !== "PARENT" && recipient.role !== "TEACHER") continue;

        try {
          await sendMessageNotificationEmail({
            to: recipient.email,
            recipientName: `${recipient.first_name} ${recipient.last_name}`.trim(),
            senderName,
            senderRole: actor.user.role as "MANAGER" | "TEACHER",
            subject,
            contentPreview: content,
            portalUrl,
          });
          await queryDb(`UPDATE messages SET email_status = 'SENT' WHERE id = $1`, [messageId]);
        } catch (emailErr) {
          console.error("Message notification email failed:", emailErr);
          await queryDb(`UPDATE messages SET email_status = 'FAILED' WHERE id = $1`, [messageId]);
        }
      }
    }

    return NextResponse.json({
      messageIds,
      broadcastId: broadcastId ?? undefined,
    });
  } catch (error) {
    console.error("POST /api/messages error:", error);
    return NextResponse.json({ message: "Błąd wysyłania wiadomości" }, { status: 500 });
  }
}
