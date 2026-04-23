import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

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

    // Email do szkoły
    const schoolEmailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a5c44;">Nowa wiadomość z formularza kontaktowego</h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Email nadawcy:</strong> ${email}</p>
          <p><strong>Temat:</strong> ${subjectText}</p>
          ${childAge ? `<p><strong>Wiek dziecka:</strong> ${childAge}</p>` : ""}
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h3 style="color: #1a5c44; margin-top: 0;">Wiadomość:</h3>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Ta wiadomość została wysłana z formularza kontaktowego na stronie Harry English.
        </p>
      </div>
    `;

    // Email potwierdzający dla nadawcy
    const confirmationEmailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a5c44;">Dziękujemy za kontakt!</h2>
        
        <p>Otrzymaliśmy Twoją wiadomość i odpowiemy najszybciej jak to możliwe.</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1a5c44; margin-top: 0;">Kopia Twojej wiadomości:</h3>
          <p><strong>Temat:</strong> ${subjectText}</p>
          ${childAge ? `<p><strong>Wiek dziecka:</strong> ${childAge}</p>` : ""}
          <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 10px;">
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
        </div>
        
        <div style="background: #1a5c44; color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Szkoła językowa Żyrafa Harry</h3>
          <p>ul. Przykładowa 1, 00-000 Miasto</p>
          <p>tel. +48 123 123 123</p>
          <p>kontakt@harry-english.pl</p>
        </div>
        
        <p style="color: #666; font-size: 12px;">
          Jeśli nie wysyłałeś/aś tej wiadomości, zignoruj tego maila.
        </p>
      </div>
    `;

    const auth = {
      user: process.env.EMAIL_USER,
      pass: (process.env.EMAIL_PASS ?? "").trim(),
    };
    const hosts = ["smtppro.zoho.eu", "smtppro.zoho.com", "smtp.zoho.eu", "smtp.zoho.com"];
    const baseConfig = { port: 587, secure: false, auth };

    let lastError: unknown = null;
    for (const host of hosts) {
      try {
        const transporter = nodemailer.createTransport({ ...baseConfig, host });
        await transporter.sendMail({
          from: { name: "Harry English", address: process.env.EMAIL_USER! },
          to: "kontakt@harry-english.pl",
          subject: `[Harry English] ${subjectText}`,
          html: schoolEmailContent,
          replyTo: email,
        });
        await transporter.sendMail({
          from: { name: "Harry English", address: process.env.EMAIL_USER! },
          to: email,
          subject: "Potwierdzenie otrzymania wiadomości - Harry English",
          html: confirmationEmailContent,
        });
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (lastError) throw lastError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Błąd podczas wysyłania wiadomości" },
      { status: 500 }
    );
  }
}
