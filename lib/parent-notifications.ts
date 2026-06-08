import { randomUUID } from "crypto";
import { sendMessageNotificationEmail } from "@/lib/email";
import { queryDb, runPgTransaction } from "@/lib/db";
import { insertMessages } from "@/lib/messages";

export type ParentNotifyRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type MessageActorInfo = {
  id: string;
  role: string;
  schoolId: string;
  firstName: string;
  lastName: string;
};

export async function notifyParents(params: {
  actor: MessageActorInfo;
  parents: ParentNotifyRow[];
  subject: string;
  content: string;
}): Promise<{ parentsNotified: number; emailsSent: number; emailsFailed: number }> {
  const { actor, parents, subject, content } = params;
  if (parents.length === 0) {
    return { parentsNotified: 0, emailsSent: 0, emailsFailed: 0 };
  }

  const broadcastId = parents.length > 1 ? randomUUID() : null;
  const messageIds = await runPgTransaction(async (client) =>
    insertMessages(
      client,
      parents.map((parent) => ({
        schoolId: actor.schoolId,
        parentId: parent.id,
        senderId: actor.id,
        senderRole: actor.role,
        recipientId: parent.id,
        subject,
        content,
        parentMessageId: null,
        broadcastId,
      })),
    ),
  );

  const senderName = `${actor.firstName} ${actor.lastName}`.trim();
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.harry-english.pl";
  const senderRoleForEmail: "MANAGER" | "TEACHER" =
    actor.role === "TEACHER" ? "TEACHER" : "MANAGER";

  let emailsSent = 0;
  let emailsFailed = 0;

  for (let i = 0; i < parents.length; i++) {
    const parent = parents[i];
    const messageId = messageIds[i];
    if (!parent.email?.trim()) continue;

    try {
      await sendMessageNotificationEmail({
        to: parent.email.trim(),
        recipientName: `${parent.first_name} ${parent.last_name}`.trim(),
        senderName,
        senderRole: senderRoleForEmail,
        subject,
        contentPreview: content,
        portalUrl,
      });
      emailsSent += 1;
      if (messageId) {
        await queryDb(`UPDATE messages SET email_status = 'SENT' WHERE id = $1`, [messageId]);
      }
    } catch (emailErr) {
      console.error("Parent notification email failed:", emailErr);
      emailsFailed += 1;
      if (messageId) {
        await queryDb(`UPDATE messages SET email_status = 'FAILED' WHERE id = $1`, [messageId]);
      }
    }
  }

  return { parentsNotified: parents.length, emailsSent, emailsFailed };
}
