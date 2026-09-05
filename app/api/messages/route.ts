import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { sendMessageNotificationEmail, sendResignationEmail } from "@/lib/email";
import {
  getChildById,
  getUserById,
  queryDb,
  requestChildResignation,
  runPgTransaction,
} from "@/lib/db";
import { isValidEmailAddress } from "@/lib/email-address";
import { fillTemplatePlaceholders } from "@/lib/message-templates";
import {
  fetchThreadRoots,
  getThreadRootId,
  getUsersForEmail,
  insertMessages,
  requireMessageActor,
  resolveParentIdForMessage,
  resolveUsersByEmails,
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
        unreadCount: parseInt(t.unread_count, 10) || 0,
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
    externalEmails?: unknown;
    enrollmentEmailRecipients?: unknown;
    subject?: unknown;
    content?: unknown;
    parentMessageId?: unknown;
    templateKey?: unknown;
    templateFields?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Nieprawidłowe dane" }, { status: 400 });
  }

  const recipientIds = Array.isArray(body.recipientIds)
    ? body.recipientIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const externalEmailsInput = Array.isArray(body.externalEmails)
    ? body.externalEmails
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => isValidEmailAddress(e))
    : [];
  const externalEmails = [...new Set(externalEmailsInput)];
  const enrollmentEmailRecipients = Array.isArray(body.enrollmentEmailRecipients)
    ? body.enrollmentEmailRecipients
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as { email?: unknown; childName?: unknown };
          const email =
            typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
          if (!isValidEmailAddress(email)) return null;
          const childName =
            typeof row.childName === "string" ? row.childName.trim() : "";
          return { email, childName };
        })
        .filter((r): r is { email: string; childName: string } => r != null)
    : [];
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const parentMessageId =
    typeof body.parentMessageId === "string" && body.parentMessageId.length > 0
      ? body.parentMessageId
      : null;
  const templateKey =
    typeof body.templateKey === "string" ? body.templateKey.trim() : "";
  const templateFields =
    body.templateFields && typeof body.templateFields === "object" && !Array.isArray(body.templateFields)
      ? (body.templateFields as Record<string, unknown>)
      : {};

  if (!subject || !content) {
    return NextResponse.json({ message: "Temat i treść są wymagane" }, { status: 400 });
  }

  /** E-mail ze zgłoszeń: jeden mail na dziecko, z {{dziecko}} w temacie/treści. */
  if (enrollmentEmailRecipients.length > 0) {
    if (actor.user.role !== "MANAGER" && actor.user.role !== "TEACHER") {
      return NextResponse.json(
        { message: "Brak uprawnień do wysyłki e-mail ze zgłoszeń" },
        { status: 403 }
      );
    }
    if (parentMessageId) {
      return NextResponse.json(
        { message: "E-mail ze zgłoszeń można wysłać tylko jako nową wiadomość" },
        { status: 400 }
      );
    }
    if (enrollmentEmailRecipients.length > 500) {
      return NextResponse.json(
        { message: "Maksymalnie 500 odbiorców na jedną wysyłkę" },
        { status: 400 }
      );
    }

    const senderUsers = await getUsersForEmail([actor.user.id]);
    const senderReplyTo = senderUsers[0]?.email?.trim() || undefined;
    const senderName = `${actor.user.firstName} ${actor.user.lastName}`.trim();
    const senderRole = actor.user.role as "MANAGER" | "TEACHER";
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.harry-english.pl";

    // E-mail ze zgłoszeń = wyłącznie skrzynka mailowa (bez wiadomości w panelu),
    // nawet gdy odbiorca ma konto w aplikacji.
    const personalized = enrollmentEmailRecipients.map((r) => {
      const dziecko = r.childName || "dziecko";
      return {
        email: r.email,
        childName: r.childName,
        subject: fillTemplatePlaceholders(subject, { dziecko }),
        content: fillTemplatePlaceholders(content, { dziecko }),
      };
    });

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const item of personalized) {
      const recipientName = item.childName
        ? `Rodzic: ${item.childName}`
        : (() => {
            const localPart = item.email.split("@")[0] ?? "";
            return localPart.length > 0
              ? localPart.charAt(0).toUpperCase() + localPart.slice(1)
              : "Odbiorco";
          })();

      try {
        await sendMessageNotificationEmail({
          to: item.email,
          recipientName,
          senderName,
          senderRole,
          subject: item.subject,
          contentPreview: item.content,
          portalUrl,
          deliveryMode: "direct-email",
          replyTo: senderReplyTo,
        });
        emailsSent += 1;
      } catch (emailErr) {
        console.error("Enrollment message notification email failed:", emailErr);
        emailsFailed += 1;
      }
    }

    return NextResponse.json({
      messageIds: [],
      emailsSent,
      emailsFailed,
      externalEmailsCount: personalized.length,
    });
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

  if (parentMessageId && externalEmails.length > 0) {
    return NextResponse.json(
      { message: "Adresy e-mail można dodać tylko przy nowej wiadomości" },
      { status: 400 }
    );
  }

  if (
    actor.user.role !== "MANAGER" &&
    actor.user.role !== "TEACHER" &&
    externalEmails.length > 0
  ) {
    return NextResponse.json(
      { message: "Brak uprawnień do wysyłki na adresy e-mail spoza listy" },
      { status: 403 }
    );
  }

  if (externalEmails.length > 500) {
    return NextResponse.json(
      { message: "Maksymalnie 500 adresów e-mail na jedną wysyłkę" },
      { status: 400 }
    );
  }

  let effectiveRecipientIds = [...recipientIds];
  const emailOnlyRecipients: string[] = [];
  /** Wysyłka z sekcji „E-mail”: tylko skrzynka, bez wiadomości w panelu. */
  const isDirectEmailCompose =
    recipientIds.length === 0 && externalEmails.length > 0 && !parentMessageId;

  if (externalEmails.length > 0) {
    if (isDirectEmailCompose) {
      emailOnlyRecipients.push(...externalEmails);
    } else {
      const byEmail = await resolveUsersByEmails(actor.user.schoolId, externalEmails);
      const knownEmails = new Set(
        (await getUsersForEmail(effectiveRecipientIds))
          .map((u) => u.email.trim().toLowerCase())
          .filter(Boolean)
      );

      for (const email of externalEmails) {
        const matched = byEmail.get(email);
        if (matched && matched.id !== actor.user.id) {
          if (!effectiveRecipientIds.includes(matched.id)) {
            effectiveRecipientIds.push(matched.id);
          }
          continue;
        }
        if (knownEmails.has(email)) continue;
        emailOnlyRecipients.push(email);
      }
    }
  }

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

  if (effectiveRecipientIds.length === 0 && emailOnlyRecipients.length === 0) {
    return NextResponse.json(
      { message: "Wybierz odbiorców z listy lub podaj co najmniej jeden adres e-mail" },
      { status: 400 }
    );
  }

  const uniqueRecipients = [...new Set(effectiveRecipientIds)];

  if (uniqueRecipients.length > 0) {
    const validation = await validateRecipientsForSender({
      senderId: actor.user.id,
      senderRole: actor.user.role,
      schoolId: actor.user.schoolId,
      recipientIds: uniqueRecipients,
      threadRootId,
    });
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 403 });
    }
  }

  /** Szablon rezygnacji: zapisz formalne zgłoszenie przed wysłaniem wiadomości. */
  if (actor.user.role === "PARENT" && !parentMessageId && templateKey === "resignation") {
    const childId =
      typeof templateFields.dziecko === "string" ? templateFields.dziecko.trim() : "";
    const reasonFromField =
      typeof templateFields.powod === "string" ? templateFields.powod.trim() : "";
    const reason = reasonFromField || content.trim();
    if (!childId || !reason) {
      return NextResponse.json(
        { message: "Rezygnacja wymaga wyboru dziecka i treści wiadomości" },
        { status: 400 }
      );
    }

    const child = await getChildById(childId);
    if (!child || child.parent_id !== actor.user.id) {
      return NextResponse.json(
        { message: "Dziecko nie zostało znalezione lub nie należy do użytkownika" },
        { status: 404 }
      );
    }

    const success = await requestChildResignation(childId, actor.user.id, reason);
    if (!success) {
      return NextResponse.json(
        { message: "Nie udało się zgłosić rezygnacji — spróbuj ponownie" },
        { status: 500 }
      );
    }

    const parentUser = await getUserById(actor.user.id);
    if (parentUser) {
      try {
        await sendResignationEmail(
          parentUser.first_name,
          parentUser.last_name,
          parentUser.email,
          child.first_name,
          child.last_name,
          child.id,
          reason
        );
      } catch (emailError) {
        console.error("Resignation email after message template failed:", emailError);
      }
    }
  }

  const broadcastId = uniqueRecipients.length > 1 ? randomUUID() : null;

  const recipientUsers = await getUsersForEmail(uniqueRecipients);
  const recipientMap = new Map(recipientUsers.map((u) => [u.id, u]));

  try {
    const messageIds =
      uniqueRecipients.length === 0
        ? []
        : await runPgTransaction(async (client) => {
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

    const shouldSendEmail = actor.user.role === "MANAGER" || actor.user.role === "TEACHER";
    let emailsSent = 0;
    let emailsFailed = 0;

    if (shouldSendEmail) {
      const senderName = `${actor.user.firstName} ${actor.user.lastName}`.trim();
      const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.harry-english.pl";
      const senderRole = actor.user.role as "MANAGER" | "TEACHER";
      const senderUsers = isDirectEmailCompose
        ? await getUsersForEmail([actor.user.id])
        : [];
      const senderReplyTo = senderUsers[0]?.email?.trim() || undefined;
      const emailNotifyParams = {
        deliveryMode: isDirectEmailCompose
          ? ("direct-email" as const)
          : ("portal" as const),
        replyTo: senderReplyTo,
      };

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
            senderRole,
            subject,
            contentPreview: content,
            portalUrl,
            ...emailNotifyParams,
          });
          emailsSent += 1;
          if (messageId) {
            await queryDb(`UPDATE messages SET email_status = 'SENT' WHERE id = $1`, [messageId]);
          }
        } catch (emailErr) {
          console.error("Message notification email failed:", emailErr);
          emailsFailed += 1;
          if (messageId) {
            await queryDb(`UPDATE messages SET email_status = 'FAILED' WHERE id = $1`, [messageId]);
          }
        }
      }

      for (const email of emailOnlyRecipients) {
        const localPart = email.split("@")[0] ?? "";
        const displayName =
          localPart.length > 0
            ? localPart.charAt(0).toUpperCase() + localPart.slice(1)
            : "Odbiorco";
        try {
          await sendMessageNotificationEmail({
            to: email,
            recipientName: displayName,
            senderName,
            senderRole,
            subject,
            contentPreview: content,
            portalUrl,
            ...emailNotifyParams,
          });
          emailsSent += 1;
        } catch (emailErr) {
          console.error("External message notification email failed:", emailErr);
          emailsFailed += 1;
        }
      }
    }

    return NextResponse.json({
      messageIds,
      broadcastId: broadcastId ?? undefined,
      emailsSent,
      emailsFailed,
      externalEmailsCount: emailOnlyRecipients.length,
    });
  } catch (error) {
    console.error("POST /api/messages error:", error);
    return NextResponse.json({ message: "Błąd wysyłania wiadomości" }, { status: 500 });
  }
}
