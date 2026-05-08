import { NextRequest, NextResponse } from "next/server";
import { buildEmailShell, escapeHtmlForEmail, transporter } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, subject, childAge, message } = body;

    // Walidacja
    if (!email || !subject || !message) {
      return NextResponse.json(
        { error: "Brakuje wymaganych pól" },
        { status: 400 }
      );
    }

    // Mapowanie tematu na czytelny tekst
    const subjectMap: { [key: string]: string } = {
      zapisanie: "Zapisanie dziecka na zajęcia",
      lekcja: "Lekcja pokazowa",
      program: "Pytanie odnośnie programu",
      platnosci: "Pytanie odnośnie płatności",
      postepy: "Zapytanie o postępy dziecka",
      inne: "Inne",
    };

    const subjectText = subjectMap[subject] || subject;

    const safeEmail = escapeHtmlForEmail(email);
    const safeSubjectText = escapeHtmlForEmail(subjectText);
    const safeChildAge = childAge ? escapeHtmlForEmail(String(childAge)) : "";
    const safeMessage = escapeHtmlForEmail(message).replace(/\n/g, "<br />");

    // Email do szkoły
    const schoolEmailContent = buildEmailShell({
      title: "Nowa wiadomość z formularza kontaktowego",
      intro: "Przesłano nową wiadomość przez formularz kontaktowy na stronie Harry English.",
      contentHtml: `
        <div style="border:1px solid #d9e0db;background:#f8faf8;padding:14px 16px;border-radius:10px;margin-bottom:14px;font-size:14px;line-height:1.6;">
          <strong>Dane nadawcy</strong><br />
          Email: <a href="mailto:${safeEmail}" style="color:#175244;">${safeEmail}</a><br />
          Temat: ${safeSubjectText}<br />
          ${safeChildAge ? `Wiek dziecka: ${safeChildAge}` : "Wiek dziecka: brak"}
        </div>
        <div style="border:1px solid #d9e0db;background:#ffffff;padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.6;">
          <strong>Wiadomość</strong><br />
          <span>${safeMessage}</span>
        </div>
        <p style="color:#6b7280;font-size:12px;margin-top:14px;">
          Ta wiadomość została wysłana z formularza kontaktowego na stronie Harry English.
        </p>
      `,
    });

    // Email potwierdzający dla nadawcy
    const confirmationEmailContent = buildEmailShell({
      title: "Potwierdzenie otrzymania wiadomości",
      intro: "Dziękujemy - Twoja wiadomość dotarła. Odezwiemy się do Ciebie najszybciej jak to możliwe.",
      contentHtml: `
        <div style="border:1px solid #d9e0db;background:#f8faf8;padding:14px 16px;border-radius:10px;margin-bottom:14px;font-size:14px;line-height:1.6;">
          <strong>Kopia Twojej wiadomości</strong><br />
          Temat: ${safeSubjectText}<br />
          ${safeChildAge ? `Wiek dziecka: ${safeChildAge}<br />` : ""}
          Treść:<br />
          <span>${safeMessage}</span>
        </div>
        <p style="color:#6b7280;font-size:12px;margin:0;">
          Jeśli nie wysyłałeś/aś tej wiadomości, zignoruj tego maila.
        </p>
      `,
    });

    const fromAddress = process.env.EMAIL_USER || "kontakt@harry-english.pl";
    await transporter.sendMail({
      from: { name: "Harry English", address: fromAddress },
      to: "kontakt@harry-english.pl",
      subject: `[Harry English] ${subjectText}`,
      html: schoolEmailContent,
      replyTo: email,
    });
    await transporter.sendMail({
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
