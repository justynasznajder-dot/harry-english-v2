import nodemailer from 'nodemailer';

// Konfiguracja transportera email (Zoho Mail dla domeny harry-english.pl)
export const transporter = nodemailer.createTransport({
  host: 'smtppro.zoho.eu',
  port: 587,
  secure: false,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: (process.env.EMAIL_PASS ?? '').trim(),
  },
});

const BRAND_GREEN_DARK = "#0f3c33";
const BRAND_GREEN = "#175244";
const BRAND_YELLOW = "#ffc94a";
const BRAND_TEXT = "#1f2937";
const BRAND_MUTED = "#6b7280";
const BRAND_BG = "#f3f5f4";
const BRAND_CARD_BG = "#ffffff";
const BRAND_FONT = "Geist, Arial, Helvetica, sans-serif";

function getAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return "https://www.harry-english.pl";
  return raw.replace(/\/$/, "");
}

function getPublicEmailAssetBaseUrl(): string {
  const appUrl = getAppBaseUrl();
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(appUrl)) {
    return "https://www.harry-english.pl";
  }
  return appUrl;
}

function buildEmailShell(params: {
  title: string;
  intro?: string;
  contentHtml: string;
  footerHtml?: string;
}): string {
  const logoUrl = `${getPublicEmailAssetBaseUrl()}/images/2zyrafa2.png`;
  const footer =
    params.footerHtml ??
    `<p style="margin:0;">Harry English</p>
     <p style="margin:4px 0 0 0;">kontakt@harry-english.pl</p>
     <p style="margin:2px 0 0 0;">www.harry-english.pl</p>`;

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:${BRAND_BG};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${BRAND_BG};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;background:${BRAND_CARD_BG};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(180deg,#073229 0%,${BRAND_GREEN_DARK} 100%);padding:16px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td align="left" valign="middle">
                      <img src="${logoUrl}" alt="" width="56" style="display:block;border:0;outline:none;text-decoration:none;" />
                    </td>
                    <td align="right" valign="middle" style="font-family:${BRAND_FONT};font-size:42px;line-height:1.1;font-weight:700;color:${BRAND_YELLOW};">
                      Harry English
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:6px;background:${BRAND_YELLOW};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 22px 18px 22px;font-family:${BRAND_FONT};color:${BRAND_TEXT};">
                <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:${BRAND_GREEN};">${params.title}</h1>
                ${
                  params.intro
                    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${BRAND_TEXT};">${params.intro}</p>`
                    : ""
                }
                ${params.contentHtml}
              </td>
            </tr>
            <tr>
              <td style="background:#f8f8f8;border-top:1px solid #e5e7eb;padding:14px 22px;font-family:${BRAND_FONT};font-size:12px;line-height:1.6;color:${BRAND_MUTED};">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Funkcja do wysyłania emaila powitalnego
export async function sendWelcomeEmail(
  to: string,
  parentFirstName: string,
  parentLastName: string,
  childFirstName: string
) {
  const appUrl = getAppBaseUrl();
  const mailOptions = {
    from: {
      name: 'Harry English',
      address: process.env.EMAIL_USER || 'kontakt@harry-english.pl',
    },
    to,
    subject: '🦒 Witamy w Harry English!',
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(parentFirstName)} ${escapeHtmlForEmail(parentLastName)}!`,
      intro: `Cieszymy się, że dołączyliście do Harry English wraz z ${escapeHtmlForEmail(childFirstName)}.`,
      contentHtml: `
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">
          Twoje konto zostało pomyślnie utworzone. Czekamy na kontakt z naszej strony i przygotowujemy dla Was spersonalizowany plan zajęć.
        </p>
        <p style="margin:0 0 8px 0;font-size:16px;line-height:1.5;font-weight:700;color:${BRAND_GREEN};">Co dalej?</p>
        <ul style="margin:0 0 14px 18px;padding:0;font-size:15px;line-height:1.6;color:${BRAND_TEXT};">
          <li>Nasz lektor skontaktuje się z Tobą w ciągu 24-48 godzin.</li>
          <li>Ustalimy dogodne terminy zajęć dla ${escapeHtmlForEmail(childFirstName)}.</li>
          <li>Otrzymasz harmonogram i materiały do nauki.</li>
          <li>Już wkrótce będziecie mogli korzystać z pełni możliwości portalu.</li>
        </ul>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">
          <strong>Prosimy o cierpliwość</strong> - skontaktujemy się z Tobą wkrótce, aby potwierdzić możliwe terminy zajęć i omówić szczegóły kursu.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="border-radius:999px;background:${BRAND_YELLOW};">
              <a href="${appUrl}/portal" style="display:inline-block;padding:12px 24px;font-family:${BRAND_FONT};font-size:14px;font-weight:700;color:#3b2a10;text-decoration:none;">
                Przejdź do portalu
              </a>
            </td>
          </tr>
        </table>
      `,
    }),
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
  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: {
      name: 'Harry English',
      address: process.env.EMAIL_USER || 'kontakt@harry-english.pl',
    },
    to,
    subject: '🔐 Reset hasła - Harry English',
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(parentFirstName)}!`,
      intro: "Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w Harry English.",
      contentHtml: `
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">Aby ustawić nowe hasło, kliknij poniższy przycisk:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:14px;">
          <tr>
            <td style="border-radius:999px;background:${BRAND_YELLOW};">
              <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;font-family:${BRAND_FONT};font-size:14px;font-weight:700;color:#3b2a10;text-decoration:none;">
                Ustaw nowe hasło
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:${BRAND_MUTED};">
          Lub skopiuj i wklej ten link do przeglądarki:<br />
          <a href="${resetUrl}" style="color:${BRAND_GREEN};word-break:break-all;">${resetUrl}</a>
        </p>
        <div style="background:#fff3cd;border-left:4px solid #f59e0b;padding:14px;border-radius:8px;">
          <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;font-weight:700;">Ważne informacje:</p>
          <ul style="margin:0 0 0 18px;padding:0;font-size:14px;line-height:1.6;">
            <li>Link jest ważny przez 1 godzinę.</li>
            <li>Jeśli nie prosiłeś/aś o reset hasła, zignoruj tę wiadomość.</li>
            <li>Twoje obecne hasło pozostaje aktywne do momentu ustawienia nowego.</li>
          </ul>
        </div>
      `,
    }),
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
    html: buildEmailShell({
      title: "Rezygnacja z kursu",
      intro: "Rodzic zgłosił chęć rezygnacji z kursu dla swojego dziecka.",
      contentHtml: `
        <div style="border:1px solid #d9e0db;background:#ffffff;padding:14px 16px;border-radius:10px;margin-bottom:12px;">
          <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;"><strong>Dziecko:</strong> ${escapeHtmlForEmail(childFirstName)} ${escapeHtmlForEmail(childLastName)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;"><strong>ID studenta:</strong> ${escapeHtmlForEmail(studentId)}</p>
        </div>
        <div style="border:1px solid #d9e0db;background:#ffffff;padding:14px 16px;border-radius:10px;margin-bottom:12px;">
          <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;"><strong>Rodzic:</strong> ${escapeHtmlForEmail(parentFirstName)} ${escapeHtmlForEmail(parentLastName)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;"><strong>Email:</strong> ${escapeHtmlForEmail(parentEmail)}</p>
        </div>
        <div style="border:2px solid #dc2626;background:#fff;padding:14px 16px;border-radius:10px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#b91c1c;">Powód rezygnacji</p>
          <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtmlForEmail(reason)}</p>
        </div>
      `,
      footerHtml: `<p style="margin:0;">Harry English</p><p style="margin:4px 0 0 0;">System automatycznego powiadamiania</p>`,
    }),
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

export async function sendEnrollmentConfirmationToParent(params: {
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  children: PublicEnrollmentBackupChild[];
}): Promise<void> {
  const fromAddr = process.env.EMAIL_USER || "kontakt@harry-english.pl";

  const childrenBlocks = params.children
    .map(
      (ch) => `
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="border:1px solid #d9e0db;background:#ffffff;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">
                  <strong>Dziecko ${ch.index}</strong><br />
                  Imię: ${escapeHtmlForEmail(ch.firstName)}<br />
                  Nazwisko: ${escapeHtmlForEmail(ch.lastName)}<br />
                  Data urodzenia: ${escapeHtmlForEmail(ch.birthDate)}<br />
                  Preferowana lokalizacja: ${escapeHtmlForEmail(ch.preferredLocationLabel)}
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join("");

  const textChildren = params.children
    .map(
      (ch) =>
        `${ch.index}. ${ch.firstName} ${ch.lastName}, ur. ${ch.birthDate}, preferowana lokalizacja: ${ch.preferredLocationLabel}`
    )
    .join("\n");

  await transporter.sendMail({
    from: {
      name: "Harry English",
      address: fromAddr,
    },
    to: params.parentEmail,
    subject: "Potwierdzenie otrzymania zgłoszenia - Harry English",
    html: buildEmailShell({
      title: "Potwierdzenie otrzymania zgłoszenia",
      intro: "Dziękujemy - Twoje zgłoszenie dotarło. Odezwiemy się do Ciebie wkrótce, aby ustalić szczegóły.",
      contentHtml: `
        <div style="border:1px solid #d9e0db;background:#f8faf8;padding:14px 16px;border-radius:10px;margin-bottom:14px;font-size:14px;line-height:1.6;">
          <strong>Dane rodzica</strong><br />
          Imię: ${escapeHtmlForEmail(params.parentFirstName)}<br />
          Nazwisko: ${escapeHtmlForEmail(params.parentLastName)}
        </div>
        <p style="margin:0 0 10px 0;font-size:18px;line-height:1.4;font-weight:700;color:${BRAND_GREEN};">
          Lista dzieci
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          ${childrenBlocks}
        </table>
      `,
    }),
    text: `
Potwierdzenie otrzymania zgłoszenia

Dziękujemy — Twoje zgłoszenie dotarło.

Dane rodzica:
- Imię: ${params.parentFirstName}
- Nazwisko: ${params.parentLastName}

Lista dzieci:
${textChildren}

Odezwiemy się do Ciebie wkrótce, aby ustalić szczegóły.

Kontakt:
- kontakt@harry-english.pl
- www.harry-english.pl
    `.trim(),
  });
}

export async function sendPublicEnrollmentBackupEmail(params: {
  schoolId: string;
  schoolName: string;
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
    html: buildEmailShell({
      title: "Nowe zgłoszenie z formularza na stronie",
      contentHtml: `
        ${dbNote}
        <p style="margin:12px 0 6px 0;font-size:16px;line-height:1.5;font-weight:700;color:${BRAND_GREEN};">Szkoła</p>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;"><strong>Nazwa:</strong> ${escapeHtmlForEmail(params.schoolName)}</p>
        <p style="margin:0 0 6px 0;font-size:16px;line-height:1.5;font-weight:700;color:${BRAND_GREEN};">Rodzic</p>
        <ul style="margin:0 0 12px 18px;padding:0;font-size:14px;line-height:1.6;">
          <li><strong>Imię:</strong> ${escapeHtmlForEmail(params.parentFirstName)}</li>
          <li><strong>Nazwisko:</strong> ${escapeHtmlForEmail(params.parentLastName)}</li>
          <li><strong>Email:</strong> ${escapeHtmlForEmail(params.parentEmail)}</li>
          <li><strong>Telefon:</strong> ${escapeHtmlForEmail(params.parentPhone)}</li>
          <li><strong>Zgoda RODO:</strong> ${params.rodoConsent ? "tak" : "nie"}</li>
        </ul>
        <p style="margin:0 0 8px 0;font-size:16px;line-height:1.5;font-weight:700;color:${BRAND_GREEN};">Dzieci</p>
        <table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px;">
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
        <p style="margin:14px 0 0 0;font-size:12px;color:${BRAND_MUTED};">Wiadomość wygenerowana automatycznie — kopia zapasowa treści formularza.</p>
      `,
    }),
    text: `
${params.dbSaveOk ? "Zapis w bazie: OK" : "UWAGA: BŁĄD ZAPISU W BAZIE"}
Szkoła: ${params.schoolName}
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
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(parentName)},`,
      intro: "Przygotowaliśmy propozycję grupy dla Twojego dziecka.",
      contentHtml: `
        <ul style="margin:0 0 12px 18px;padding:0;font-size:15px;line-height:1.6;">
          <li><strong>Grupa:</strong> ${escapeHtmlForEmail(proposal.groupName)}</li>
          <li><strong>Lokalizacja:</strong> ${escapeHtmlForEmail(proposal.locationName)}</li>
          <li><strong>Termin:</strong> ${escapeHtmlForEmail(proposal.schedule)}</li>
          <li><strong>Cena miesięczna:</strong> ${proposal.priceMonthly} zł</li>
        </ul>
        <p style="margin:0;font-size:15px;line-height:1.6;">Zaloguj się do portalu, aby zaakceptować termin lub poprosić o inny.</p>
      `,
    }),
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
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(parentName)},`,
      intro: "Twoja umowa została przygotowana. Zapoznaj się z nią i podpisz ją w portalu.",
      contentHtml: `
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 12px 0;" />
        ${contractHtml}
      `,
    }),
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
    html: buildEmailShell({
      title: "Podpisana umowa",
      intro: "Umowa została podpisana elektronicznie.",
      contentHtml: `
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 12px 0;" />
        ${contractHtml}
      `,
    }),
    text: "Umowa została podpisana elektronicznie. Szczegóły znajdują się w wersji HTML wiadomości.",
  });
}
