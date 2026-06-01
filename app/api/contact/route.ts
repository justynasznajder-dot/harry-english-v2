import { NextRequest, NextResponse } from "next/server";
import {
  buildDirectMessageEmailBodyHtml,
  buildEmailShell,
  escapeHtmlForEmail,
  getEmailPalette,
  sendHarryMail,
} from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, subject, message } = body;

    // Walidacja
    if (!email || !phone || !subject || !message) {
      return NextResponse.json(
        { error: "Brakuje wymaganych pól" },
        { status: 400 }
      );
    }

    // Mapowanie tematu na czytelny tekst
    const subjectMap: { [key: string]: string } = {
      lekcja: "Lekcja pokazowa",
      program: "Pytanie odnośnie programu",
      platnosci: "Pytanie odnośnie płatności",
      postepy: "Zapytanie o postępy dziecka",
      inne: "Inne",
    };

    const subjectText = subjectMap[subject] || subject;

    const p = getEmailPalette();
    const safeEmail = escapeHtmlForEmail(email);
    const safePhone = escapeHtmlForEmail(phone);
    const safeSubjectText = escapeHtmlForEmail(subjectText);

    const senderDetailsHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 12px 0;">
          <tr>
            <td bgcolor="${p.insetBg}" style="border:1px solid ${p.insetBorder};background-color:${p.insetBg};color:${p.insetText};padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:${p.accentWarm};">Dane nadawcy</p>
              <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:${p.insetText};">
                Email: <a href="mailto:${safeEmail}" class="he-email-body-link" style="color:${p.insetLink} !important;">${safeEmail}</a>
              </p>
              <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:${p.insetText};">
                Telefon: <a href="tel:${safePhone}" class="he-email-body-link" style="color:${p.insetLink} !important;">${safePhone}</a>
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:${p.insetText};">Temat: ${safeSubjectText}</p>
            </td>
          </tr>
        </table>`;

    const messageBodyHtml = buildDirectMessageEmailBodyHtml(message, p);

    // Email do szkoły
    const schoolEmailContent = buildEmailShell({
      title: "Nowa wiadomość z formularza kontaktowego",
      intro: "Przesłano nową wiadomość przez formularz kontaktowy na stronie Harry English.",
      palette: p,
      contentHtml: `
        ${senderDetailsHtml}
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:${p.accentWarm};">Wiadomość</p>
        ${messageBodyHtml}
        <p style="color:${p.text};font-size:12px;margin-top:14px;opacity:0.85;">
          Ta wiadomość została wysłana z formularza kontaktowego na stronie Harry English.
        </p>
      `,
    });

    // Email potwierdzający dla nadawcy
    const confirmationMetaHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 12px 0;">
          <tr>
            <td bgcolor="${p.insetBg}" style="border:1px solid ${p.insetBorder};background-color:${p.insetBg};color:${p.insetText};padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:${p.accentWarm};">Kopia Twojej wiadomości</p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:${p.insetText};">Temat: ${safeSubjectText}</p>
            </td>
          </tr>
        </table>`;

    const confirmationEmailContent = buildEmailShell({
      title: "Potwierdzenie otrzymania wiadomości",
      intro: "Dziękujemy - Twoja wiadomość dotarła. Odezwiemy się do Ciebie najszybciej jak to możliwe.",
      palette: p,
      contentHtml: `
        ${confirmationMetaHtml}
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:${p.accentWarm};">Treść</p>
        ${messageBodyHtml}
        <p style="color:${p.text};font-size:12px;margin:14px 0 0 0;opacity:0.85;">
          Jeśli nie wysyłałeś/aś tej wiadomości, zignoruj tego maila.
        </p>
      `,
    });

    const fromAddress = process.env.EMAIL_USER || "kontakt@harry-english.pl";
    await sendHarryMail({
      from: { name: "Harry English", address: fromAddress },
      to: "kontakt@harry-english.pl",
      subject: `[Harry English] ${subjectText}`,
      html: schoolEmailContent,
      replyTo: email,
    });
    await sendHarryMail({
      from: { name: "Harry English", address: fromAddress },
      to: email,
      subject: "Potwierdzenie otrzymania wiadomości - Harry English",
      html: confirmationEmailContent,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      {
        error: "Błąd podczas wysyłania wiadomości",
        ...(process.env.NODE_ENV !== "production"
          ? { details: error instanceof Error ? error.message : String(error) }
          : {}),
      },
      { status: 500 }
    );
  }
}
