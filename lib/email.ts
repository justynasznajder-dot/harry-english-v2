import nodemailer from 'nodemailer';

// Konfiguracja transportera email (Zoho Mail dla domeny harry-english.pl)
export const transporter = nodemailer.createTransport({
  host: 'smtppro.zoho.eu',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: (process.env.EMAIL_PASS ?? '').trim(),
  },
});

// Funkcja do wysyłania emaila powitalnego
export async function sendWelcomeEmail(
  to: string,
  parentFirstName: string,
  parentLastName: string,
  childFirstName: string
) {
  const mailOptions = {
    from: {
      name: 'Harry English',
      address: process.env.EMAIL_USER || 'kontakt@harry-english.pl',
    },
    to,
    subject: '🦒 Witamy w Harry English!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #0f3c33 0%, #175244 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
          }
          .content {
            background: #f8f6f3;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            background: #ffc94a;
            color: #3b2a10;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 25px;
            font-weight: bold;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
          }
          h1 {
            margin: 0;
            font-size: 28px;
          }
          h2 {
            color: #175244;
            margin-top: 0;
          }
          ul {
            list-style: none;
            padding: 0;
          }
          li {
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
          }
          li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #175244;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🦒 Harry English</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Witamy w naszej społeczności!</p>
        </div>
        
        <div class="content">
          <h2>Dzień dobry ${parentFirstName} ${parentLastName}!</h2>
          
          <p>Cieszymy się, że dołączyliście do Harry English wraz z <strong>${childFirstName}</strong>! 🎉</p>
          
          <p>Twoje konto zostało pomyślnie utworzone. Czekamy na kontakt z naszej strony i przygotowujemy dla Was spersonalizowany plan zajęć.</p>
          
          <h3>Co dalej?</h3>
          <ul>
            <li>Nasz lektor skontaktuje się z Tobą w ciągu 24-48 godzin</li>
            <li>Ustalimy dogodne terminy zajęć dla ${childFirstName}</li>
            <li>Otrzymasz harmonogram i materiały do nauki</li>
            <li>Już wkrótce będziecie mogli korzystać z pełni możliwości portalu</li>
          </ul>
          
          <p><strong>Prosimy o cierpliwość</strong> – skontaktujemy się z Tobą wkrótce, aby potwierdzić możliwe terminy zajęć i omówić szczegóły kursu.</p>
          
          <p>W międzyczasie możesz zalogować się do portalu i zapoznać się z interfejsem:</p>
          
          <center>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal" class="button">
              Przejdź do portalu
            </a>
          </center>
        </div>
        
        <div class="footer">
          <p><strong>Harry English</strong></p>
          <p>Masz pytania? Skontaktuj się z nami:<br>
          📧 kontakt@harry-english.pl<br>
          📱 +48 123 123 123</p>
          <p style="margin-top: 15px;">
            <a href="https://www.facebook.com/Zyrafa.Harry/?locale=pl_PL" style="color: #175244; text-decoration: none;">Facebook</a>
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
Witaj ${parentFirstName} ${parentLastName}!

Cieszymy się, że dołączyliście do Harry English wraz z ${childFirstName}!

Twoje konto zostało pomyślnie utworzone. Czekamy na kontakt z naszej strony i przygotowujemy dla Was spersonalizowany plan zajęć.

Co dalej?
- Nasz lektor skontaktuje się z Tobą w ciągu 24-48 godzin
- Ustalimy dogodne terminy zajęć dla ${childFirstName}
- Otrzymasz harmonogram i materiały do nauki
- Już wkrótce będziecie mogli korzystać z pełni możliwości portalu

Prosimy o cierpliwość – skontaktujemy się z Tobą wkrótce, aby potwierdzić możliwe terminy zajęć i omówić szczegóły kursu.

Zaloguj się do portalu: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal

Masz pytania? Skontaktuj się z nami:
Email: kontakt@harry-english.pl
Tel: +48 123 123 123

Harry English
    `,
  };

  await transporter.sendMail(mailOptions);
}

// Funkcja do wysyłania emaila z resetem hasła
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  parentFirstName: string
) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: {
      name: 'Harry English',
      address: process.env.EMAIL_USER || 'kontakt@harry-english.pl',
    },
    to,
    subject: '🔐 Reset hasła - Harry English',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #0f3c33 0%, #175244 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
          }
          .content {
            background: #f8f6f3;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
          }
          .button {
            display: inline-block;
            background: #ffc94a;
            color: #3b2a10;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 25px;
            font-weight: bold;
            margin: 20px 0;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .footer {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
          }
          h1 {
            margin: 0;
            font-size: 28px;
          }
          h2 {
            color: #175244;
            margin-top: 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🦒 Harry English</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Reset hasła</p>
        </div>
        
        <div class="content">
          <h2>Dzień dobry ${parentFirstName}!</h2>
          
          <p>Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w Harry English.</p>
          
          <p>Aby ustawić nowe hasło, kliknij poniższy przycisk:</p>
          
          <center>
            <a href="${resetUrl}" class="button">
              Ustaw nowe hasło
            </a>
          </center>
          
          <p style="color: #666; font-size: 14px;">Lub skopiuj i wklej ten link do przeglądarki:<br>
          <a href="${resetUrl}" style="color: #175244; word-break: break-all;">${resetUrl}</a></p>
          
          <div class="warning">
            <strong>⚠️ Ważne informacje:</strong>
            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
              <li>Link jest ważny przez 1 godzinę</li>
              <li>Jeśli nie prosiłeś/aś o reset hasła, zignoruj tę wiadomość</li>
              <li>Twoje obecne hasło pozostaje aktywne do momentu ustawienia nowego</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Harry English</strong></p>
          <p>Masz pytania? Skontaktuj się z nami:<br>
          📧 kontakt@harry-english.pl<br>
          📱 +48 123 123 123</p>
        </div>
      </body>
      </html>
    `,
    text: `
Reset hasła - Harry English

Dzień dobry ${parentFirstName}!

Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w Harry English.

Aby ustawić nowe hasło, wejdź na poniższy link:
${resetUrl}

WAŻNE:
- Link jest ważny przez 1 godzinę
- Jeśli nie prosiłeś/aś o reset hasła, zignoruj tę wiadomość
- Twoje obecne hasło pozostaje aktywne do momentu ustawienia nowego

Masz pytania? Skontaktuj się z nami:
Email: kontakt@harry-english.pl
Tel: +48 123 123 123

Harry English
    `,
  };

  await transporter.sendMail(mailOptions);
}

// Funkcja do wysyłania emaila o rezygnacji
export async function sendResignationEmail(
  parentFirstName: string,
  parentLastName: string,
  parentEmail: string,
  childFirstName: string,
  childLastName: string,
  studentId: string,
  reason: string
) {
  const mailOptions = {
    from: {
      name: 'Harry English',
      address: process.env.EMAIL_USER || 'kontakt@harry-english.pl',
    },
    to: process.env.EMAIL_USER || 'kontakt@harry-english.pl',
    subject: `🚨 Rezygnacja z kursu - ${childFirstName} ${childLastName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
          }
          .content {
            background: #f8f6f3;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
          }
          .info-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .reason-box {
            background: white;
            border: 2px solid #dc2626;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .footer {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
          }
          h1 {
            margin: 0;
            font-size: 28px;
          }
          h2 {
            color: #175244;
            margin-top: 0;
          }
          .student-info {
            background: white;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
          }
          .student-info p {
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚨 Rezygnacja z kursu</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Nowa zgłoszona rezygnacja</p>
        </div>
        
        <div class="content">
          <h2>Informacje o rezygnacji</h2>
          
          <div class="info-box">
            <strong>⚠️ Rodzic zgłosił chęć rezygnacji z kursu dla swojego dziecka.</strong>
          </div>
          
          <div class="student-info">
            <h3 style="margin-top: 0; color: #175244;">Dane dziecka:</h3>
            <p><strong>Imię i nazwisko:</strong> ${childFirstName} ${childLastName}</p>
            <p><strong>ID studenta:</strong> ${studentId}</p>
          </div>
          
          <div class="student-info">
            <h3 style="margin-top: 0; color: #175244;">Dane rodzica:</h3>
            <p><strong>Imię i nazwisko:</strong> ${parentFirstName} ${parentLastName}</p>
            <p><strong>Email:</strong> ${parentEmail}</p>
          </div>
          
          <div class="reason-box">
            <h3 style="margin-top: 0; color: #dc2626;">Powód rezygnacji:</h3>
            <p style="white-space: pre-wrap; margin: 0;">${reason}</p>
          </div>
          
          <p style="margin-top: 20px; color: #666; font-size: 14px;">
            Prosimy o kontakt z rodzicem w celu potwierdzenia rezygnacji i omówienia szczegółów.
          </p>
        </div>
        
        <div class="footer">
          <p><strong>Harry English</strong></p>
          <p>System automatycznego powiadamiania</p>
        </div>
      </body>
      </html>
    `,
    text: `
Rezygnacja z kursu - ${childFirstName} ${childLastName}

⚠️ Rodzic zgłosił chęć rezygnacji z kursu dla swojego dziecka.

Dane dziecka:
- Imię i nazwisko: ${childFirstName} ${childLastName}
- ID studenta: ${studentId}

Dane rodzica:
- Imię i nazwisko: ${parentFirstName} ${parentLastName}
- Email: ${parentEmail}

Powód rezygnacji:
${reason}

Prosimy o kontakt z rodzicem w celu potwierdzenia rezygnacji i omówienia szczegółów.

Harry English
System automatycznego powiadamiania
    `,
  };

  await transporter.sendMail(mailOptions);
}

function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Kopie zapasowe zgłoszeń z formularza publicznego (tylko wywołanie z produkcji dla wybranej szkoły). */
export type PublicEnrollmentBackupChild = {
  index: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  preferredLocationLabel: string;
};

export async function sendPublicEnrollmentBackupEmail(params: {
  schoolId: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
  rodoConsent: boolean;
  children: PublicEnrollmentBackupChild[];
  dbSaveOk: boolean;
  dbErrorMessage?: string;
}): Promise<void> {
  const to = "kontakt@harry-english.pl";
  const fromAddr = process.env.EMAIL_USER || "kontakt@harry-english.pl";
  const subjectPrefix = params.dbSaveOk
    ? "[ZGŁOSZENIE] Formularz (zapis w bazie OK)"
    : "[ZGŁOSZENIE] UWAGA: błąd zapisu w bazie";

  const rowsHtml = params.children
    .map(
      (ch) => `
          <tr>
            <td style="padding:8px;border:1px solid #ccc;">${ch.index}</td>
            <td style="padding:8px;border:1px solid #ccc;">${escapeHtmlForEmail(ch.firstName)}</td>
            <td style="padding:8px;border:1px solid #ccc;">${escapeHtmlForEmail(ch.lastName)}</td>
            <td style="padding:8px;border:1px solid #ccc;">${escapeHtmlForEmail(ch.birthDate)}</td>
            <td style="padding:8px;border:1px solid #ccc;">${escapeHtmlForEmail(ch.preferredLocationLabel)}</td>
          </tr>`
    )
    .join("");

  const dbNote = params.dbSaveOk
    ? "<p><strong>Status:</strong> Zapis w bazie zakończył się powodzeniem (wiadomość informacyjna).</p>"
    : `<p style="color:#b45309;"><strong>Status:</strong> Zapis w bazie nie powiódł się — sprawdź bazę i wpisz zgłoszenie ręcznie.</p>
       <p style="font-size:13px;"><strong>Komunikat błędu (techniczny):</strong> ${escapeHtmlForEmail(params.dbErrorMessage ?? "(brak)")}</p>`;

  const textChildren = params.children
    .map(
      (ch) =>
        `${ch.index}. ${ch.firstName} ${ch.lastName}, ur. ${ch.birthDate}, lokalizacja: ${ch.preferredLocationLabel}`
    )
    .join("\n");

  await transporter.sendMail({
    from: {
      name: "Harry English",
      address: fromAddr,
    },
    to,
    subject: `${subjectPrefix} — ${params.parentFirstName} ${params.parentLastName}`,
    html: `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8" /></head>
      <body style="font-family:Arial,sans-serif;line-height:1.5;color:#333;max-width:720px;">
        <h2 style="color:#175244;">Nowe zgłoszenie z formularza na stronie</h2>
        ${dbNote}
        <h3 style="color:#175244;">Szkoła (school_id)</h3>
        <p style="font-family:monospace;">${escapeHtmlForEmail(params.schoolId)}</p>
        <h3 style="color:#175244;">Rodzic</h3>
        <ul>
          <li><strong>Imię:</strong> ${escapeHtmlForEmail(params.parentFirstName)}</li>
          <li><strong>Nazwisko:</strong> ${escapeHtmlForEmail(params.parentLastName)}</li>
          <li><strong>Email:</strong> ${escapeHtmlForEmail(params.parentEmail)}</li>
          <li><strong>Telefon:</strong> ${escapeHtmlForEmail(params.parentPhone)}</li>
          <li><strong>Zgoda RODO:</strong> ${params.rodoConsent ? "tak" : "nie"}</li>
        </ul>
        <h3 style="color:#175244;">Dzieci</h3>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:8px;border:1px solid #ccc;text-align:left;">#</th>
              <th style="padding:8px;border:1px solid #ccc;text-align:left;">Imię</th>
              <th style="padding:8px;border:1px solid #ccc;text-align:left;">Nazwisko</th>
              <th style="padding:8px;border:1px solid #ccc;text-align:left;">Data ur.</th>
              <th style="padding:8px;border:1px solid #ccc;text-align:left;">Preferowana lokalizacja</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#666;">Wiadomość wygenerowana automatycznie — kopia zapasowa treści formularza.</p>
      </body></html>
    `,
    text: `
${params.dbSaveOk ? "Zapis w bazie: OK" : "UWAGA: BŁĄD ZAPISU W BAZIE"}
Szkoła (school_id): ${params.schoolId}
${params.dbSaveOk ? "" : `Błąd: ${params.dbErrorMessage ?? ""}\n`}

Rodzic:
- ${params.parentFirstName} ${params.parentLastName}
- Email: ${params.parentEmail}
- Telefon: ${params.parentPhone}
- Zgoda RODO: ${params.rodoConsent ? "tak" : "nie"}

Dzieci:
${textChildren}
    `.trim(),
  });
}

// Funkcja weryfikująca konfigurację emaila
export async function verifyEmailConfig() {
  try {
    await transporter.verify();
    console.log('✅ Email configuration is valid');
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error);
    return false;
  }
}

export async function sendProposalEmail(
  to: string,
  parentName: string,
  proposal: {
    groupName: string;
    locationName: string;
    schedule: string;
    priceMonthly: number;
  }
) {
  await transporter.sendMail({
    from: {
      name: "Harry English",
      address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
    },
    to,
    subject: "Nowa propozycja grupy - Harry English",
    html: `
      <p>Dzień dobry ${parentName},</p>
      <p>Przygotowaliśmy propozycję grupy dla Twojego dziecka:</p>
      <ul>
        <li><strong>Grupa:</strong> ${proposal.groupName}</li>
        <li><strong>Lokalizacja:</strong> ${proposal.locationName}</li>
        <li><strong>Termin:</strong> ${proposal.schedule}</li>
        <li><strong>Cena miesięczna:</strong> ${proposal.priceMonthly} zł</li>
      </ul>
      <p>Zaloguj się do portalu, aby zaakceptować termin lub poprosić o inny.</p>
    `,
    text: `Dzień dobry ${parentName},
Przygotowaliśmy propozycję grupy:
- Grupa: ${proposal.groupName}
- Lokalizacja: ${proposal.locationName}
- Termin: ${proposal.schedule}
- Cena miesięczna: ${proposal.priceMonthly} zł
Zaloguj się do portalu, aby zaakceptować lub poprosić o inny termin.`,
  });
}

export async function sendContractEmail(
  to: string,
  parentName: string,
  contractHtml: string
) {
  await transporter.sendMail({
    from: {
      name: "Harry English",
      address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
    },
    to,
    subject: "Umowa gotowa do podpisu - Harry English",
    html: `
      <p>Dzień dobry ${parentName},</p>
      <p>Twoja umowa została przygotowana. Zapoznaj się z nią i podpisz ją w portalu.</p>
      <hr />
      ${contractHtml}
    `,
    text: `Dzień dobry ${parentName}, Twoja umowa została przygotowana. Zaloguj się do portalu i podpisz ją elektronicznie.`,
  });
}

export async function sendSignedContractEmail(
  parentEmail: string,
  contractHtml: string
) {
  const recipients = [parentEmail, "kontakt@harry-english.pl"];
  await transporter.sendMail({
    from: {
      name: "Harry English",
      address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
    },
    to: recipients.join(", "),
    subject: "Podpisana umowa - Harry English",
    html: `
      <p>Umowa została podpisana elektronicznie.</p>
      <hr />
      ${contractHtml}
    `,
    text: "Umowa została podpisana elektronicznie. Szczegóły znajdują się w wersji HTML wiadomości.",
  });
}
