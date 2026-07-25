import fs from "node:fs";
import path from "node:path";
import nodemailer, { type SendMailOptions } from "nodemailer";

const EMAIL_IMAGES_DIR = path.join(process.cwd(), "public", "images");

const EMAIL_CID = {
  googleBtn: "he-google-btn",
  facebookBtn: "he-facebook-btn",
  logo: "he-logo",
} as const;

function buildEmailInlineAttachments(html: string): NonNullable<SendMailOptions["attachments"]> {
  const defs: { file: string; cid: string }[] = [
    { file: "ocen_google1.png", cid: EMAIL_CID.googleBtn },
    { file: "facebook_like1.png", cid: EMAIL_CID.facebookBtn },
    { file: "2zyrafa2.png", cid: EMAIL_CID.logo },
  ];
  return defs
    .filter(({ cid }) => html.includes(`cid:${cid}`))
    .map(({ file, cid }) => {
      const filePath = path.join(EMAIL_IMAGES_DIR, file);
      if (!fs.existsSync(filePath)) return null;
      return { filename: file, path: filePath, cid };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
}

/** Wysyłka z osadzonymi obrazkami (przyciski, logo) — działają bez URL na serwerze. */
export async function sendHarryMail(options: SendMailOptions): Promise<void> {
  const html = typeof options.html === "string" ? options.html : "";
  const inline = buildEmailInlineAttachments(html);
  const extra = options.attachments ?? [];
  await transporter.sendMail({
    ...options,
    attachments: [...inline, ...(Array.isArray(extra) ? extra : [extra])],
  });
}

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

const BRAND_YELLOW = "#ffc94a";
const BRAND_FONT = "Geist, Arial, Helvetica, sans-serif";
const EMAIL_DIVIDER_HEIGHT = 5;
const EMAIL_CARD_BORDER_WIDTH = 1;
const FACEBOOK_URL = "https://www.facebook.com/Zyrafa.Harry/";
const GOOGLE_REVIEWS_URL = "https://g.page/r/CXQ-JVaomYm6EBM/review";

/** Wspólna wysokość przycisków social w stopce (szerokości z proporcji plików PNG). */
const EMAIL_SOCIAL_BTN_HEIGHT = 52;
const EMAIL_SOCIAL_GOOGLE_WIDTH = Math.round((EMAIL_SOCIAL_BTN_HEIGHT * 421) / 188);
const EMAIL_SOCIAL_FACEBOOK_WIDTH = Math.round((EMAIL_SOCIAL_BTN_HEIGHT * 681) / 227);

/** Paleta szablonu maili (gradienty ze strony, odporne na dark mode w kliencie poczty). */
export type EmailPalette = {
  canvas: string;
  outer: string;
  headerFrom: string;
  headerTo: string;
  content: string;
  divider: string;
  accentWarm: string;
  text: string;
  title: string;
  insetBg: string;
  insetBorder: string;
  insetText: string;
  insetLink: string;
  cardBorder: string;
  link: string;
};

const EMAIL_PALETTE: EmailPalette = {
  canvas: "#186653",
  outer: "#0f3c33",
  headerFrom: "#073229",
  headerTo: "#0f3c33",
  content: "#0f3c33",
  divider: "#ffc94a",
  accentWarm: "#ffc94a",
  text: "#fdfaf3",
  title: "#ffc94a",
  insetBg: "#144035",
  insetBorder: "#ffc94a",
  insetText: "#fdfaf3",
  insetLink: "#fdfaf3",
  cardBorder: "#073229",
  link: "#fdfaf3",
};

export function getEmailPalette(): EmailPalette {
  return EMAIL_PALETTE;
}

function buildEmailSocialLinksButtons(): string {
  const h = EMAIL_SOCIAL_BTN_HEIGHT;
  const googleW = EMAIL_SOCIAL_GOOGLE_WIDTH;
  const fbW = EMAIL_SOCIAL_FACEBOOK_WIDTH;
  const imgBaseStyle =
    "display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;";
  const imgSize = (w: number) =>
    `${imgBaseStyle}width:${w}px;height:${h}px;max-width:${w}px;max-height:${h}px;`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px auto 0 auto;">
      <tr>
        <td align="center" valign="middle" height="${h}" style="padding:0;height:${h}px;line-height:${h}px;">
          <a href="${GOOGLE_REVIEWS_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <img src="cid:${EMAIL_CID.googleBtn}" alt="Oceń nas w Google" width="${googleW}" height="${h}" style="${imgSize(googleW)}" />
          </a>
        </td>
        <td style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
        <td align="center" valign="middle" height="${h}" style="padding:0;height:${h}px;line-height:${h}px;">
          <a href="${FACEBOOK_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <img src="cid:${EMAIL_CID.facebookBtn}" alt="Polub nas na Facebooku" width="${fbW}" height="${h}" style="${imgSize(fbW)}" />
          </a>
        </td>
      </tr>
    </table>`;
}

function buildMessageEmailFooter(palette: EmailPalette = getEmailPalette()): string {
  const text = palette.text;
  const brandColor = palette.accentWarm;
  return `<p style="margin:0;font-size:12px;color:${text};">Aby odpowiedzieć, zaloguj się do panelu. Nie odpowiadaj na tę wiadomość.</p>
        ${buildEmailSocialLinksButtons()}
        ${buildEmailFooterBrandLine({ brandColor })}`;
}

export function buildDirectMessageEmailFooter(palette: EmailPalette = getEmailPalette()): string {
  const brandColor = palette.accentWarm;
  return `${buildEmailSocialLinksButtons()}
        ${buildEmailFooterBrandLine({ brandColor })}`;
}

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

function getEmailLogoUrl(): string {
  return `${getPublicEmailAssetBaseUrl()}/images/2zyrafa2.png`;
}

function getEmailLogoSrc(): string {
  const logoPath = path.join(EMAIL_IMAGES_DIR, "2zyrafa2.png");
  if (fs.existsSync(logoPath)) return `cid:${EMAIL_CID.logo}`;
  return getEmailLogoUrl();
}

/** Jak nagłówek/stopka: bgcolor + ten sam kolor w style (bez gradientów — Gmail je często psuje). */
function emailSolidCellStyle(bg: string, textColor?: string): string {
  const text = textColor ? `color:${textColor};` : "";
  return `background-color:${bg};${text}`;
}

/** Tło paska z żyrafą — ten sam gradient co header na stronie (fallback: headerTo). */
function emailHeaderBarStyle(p: EmailPalette): string {
  return `${emailSolidCellStyle(p.headerTo)}background-image:linear-gradient(180deg, ${p.headerFrom} 0%, ${p.headerTo} 100%);`;
}

function emailInsetCellClose(): string {
  return `</td></tr></table>`;
}

function emailDividerRow(palette: EmailPalette, heightPx = EMAIL_DIVIDER_HEIGHT): string {
  const c = palette.divider;
  return `
            <tr>
              <td bgcolor="${c}" style="height:${heightPx}px;${emailSolidCellStyle(c)}font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
            </tr>`;
}

function emailInsetCellOpen(palette: EmailPalette = getEmailPalette()): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0;">
    <tr>
      <td bgcolor="${palette.insetBg}" style="border:1px solid ${palette.insetBorder};${emailSolidCellStyle(palette.insetBg, palette.insetText)}padding:20px 22px;border-radius:12px;">`;
}

function buildEmailTitleBlock(title: string, palette: EmailPalette): string {
  return `<h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;font-weight:700;color:${palette.title};">${title}</h1>`;
}

function buildEmailIntroBlock(intro: string, palette: EmailPalette): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${palette.text};">${intro}</p>`;
}

function emailCtaButton(href: string, label: string): string {
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="border-radius:999px;background:${BRAND_YELLOW};">
              <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${BRAND_FONT};font-size:14px;font-weight:700;color:#3b2a10;text-decoration:none;">
                ${label}
              </a>
            </td>
          </tr>
        </table>`;
}

function emailSectionHeading(text: string, palette: EmailPalette): string {
  return `<p style="margin:0 0 8px 0;font-size:16px;line-height:1.5;font-weight:700;color:${palette.accentWarm};">${text}</p>`;
}

function buildEmailHeadBlock(palette: EmailPalette): string {
  return `
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <style type="text/css">
      body, table, td, div, p, h1, h2, h3, span, a, li { -webkit-text-size-adjust: 100%; }
      ${buildEmailBodyLinkStylesCss(palette.link)}
    </style>
  </head>`;
}

const EMAIL_LOGO_WIDTH = 88;

function buildEmailFooterBrandLine(options?: {
  marginTop?: string;
  fontSize?: string;
  brandColor?: string;
}): string {
  const marginTop = options?.marginTop ?? "10px";
  const fontSize = options?.fontSize ?? "15px";
  const brandColor = options?.brandColor ?? BRAND_YELLOW;
  return `<p style="margin:${marginTop} 0 0 0;font-size:${fontSize};font-weight:700;color:${brandColor};line-height:1.5;">Harry English</p>`;
}

function buildDefaultEmailFooter(palette: EmailPalette = getEmailPalette()): string {
  const siteUrl = getAppBaseUrl();
  const linkStyle = `color:${palette.link};text-decoration:underline;`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td align="center" style="font-family:${BRAND_FONT};">
          ${buildEmailFooterBrandLine({ marginTop: "0", fontSize: "16px", brandColor: palette.accentWarm })}
          <p style="margin:10px 0 0 0;font-size:13px;line-height:1.75;color:${palette.text};">
            ${buildEmailMailtoLink("kontakt@harry-english.pl", palette.link, { underline: true })}<br />
            <a href="${siteUrl}" style="${linkStyle}">www.harry-english.pl</a>
          </p>
          ${buildEmailSocialLinksButtons()}
        </td>
      </tr>
    </table>`;
}

/** Szablon HTML wszystkich maili Harry English (ciemna zieleń, odporne na dark mode). */
export function buildEmailShell(params: {
  title: string;
  intro?: string;
  contentHtml: string;
  footerHtml?: string;
  palette?: EmailPalette;
}): string {
  const logoUrl = getEmailLogoSrc();
  const p = params.palette ?? getEmailPalette();
  const footer = params.footerHtml ?? buildDefaultEmailFooter(p);

  return `<!DOCTYPE html>
<html lang="pl">
${buildEmailHeadBlock(p)}
  <body class="body" bgcolor="${p.canvas}" style="margin:0;padding:0;${emailSolidCellStyle(p.canvas, p.text)}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.canvas}" style="border-collapse:collapse;${emailSolidCellStyle(p.canvas)}">
      <tr>
        <td align="center" bgcolor="${p.canvas}" style="padding:24px 12px;${emailSolidCellStyle(p.canvas)}">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.content}" style="width:100%;max-width:640px;border-collapse:collapse;${emailSolidCellStyle(p.content)};border:${EMAIL_CARD_BORDER_WIDTH}px solid ${p.cardBorder};border-radius:16px;overflow:hidden;">
            <tr>
              <td bgcolor="${p.headerTo}" style="${emailHeaderBarStyle(p)}padding:16px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td align="left" valign="middle" width="${EMAIL_LOGO_WIDTH}" style="width:${EMAIL_LOGO_WIDTH}px;">
                      <img src="${logoUrl}" alt="Harry English" width="${EMAIL_LOGO_WIDTH}" style="display:block;width:${EMAIL_LOGO_WIDTH}px;height:auto;border:0;outline:none;text-decoration:none;" />
                    </td>
                    <td align="right" valign="middle" style="font-family:${BRAND_FONT};font-size:42px;line-height:1.1;font-weight:700;color:${p.accentWarm};">
                      Harry English
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${emailDividerRow(p)}
            <tr>
              <td bgcolor="${p.content}" style="${emailSolidCellStyle(p.content, p.text)}padding:24px 22px 18px 22px;font-family:${BRAND_FONT};font-size:15px;line-height:1.6;">
                ${buildEmailTitleBlock(params.title, p)}
                ${params.intro ? buildEmailIntroBlock(params.intro, p) : ""}
                ${params.contentHtml}
              </td>
            </tr>
            ${emailDividerRow(p)}
            <tr>
              <td bgcolor="${p.outer}" style="${emailSolidCellStyle(p.outer)}padding:22px 22px 24px 22px;font-family:${BRAND_FONT};font-size:13px;line-height:1.6;color:${p.text};">
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

// Funkcja do wysyłania emaila z resetem hasła
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  parentFirstName: string
) {
  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${resetToken}`;
  const p = getEmailPalette();

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
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:${p.text};">Aby ustawić nowe hasło, kliknij poniższy przycisk:</p>
        ${emailCtaButton(resetUrl, "Ustaw nowe hasło")}
        <p style="margin:14px 0;font-size:14px;line-height:1.6;color:${p.text};">
          Lub skopiuj i wklej ten link do przeglądarki:<br />
          <a href="${resetUrl}" class="he-email-body-link" style="color:${p.link} !important;word-break:break-all;">${resetUrl}</a>
        </p>
        <div style="background:#3d3420;border-left:4px solid #f59e0b;padding:14px;border-radius:8px;">
          <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;font-weight:700;color:${p.accentWarm};">Ważne informacje:</p>
          <ul style="margin:0 0 0 18px;padding:0;font-size:14px;line-height:1.6;color:${p.text};">
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

  await sendHarryMail(mailOptions);
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
  const p = getEmailPalette();
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
        ${emailInsetCellOpen(p)}
          <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>Dziecko:</strong> ${escapeHtmlForEmail(childFirstName)} ${escapeHtmlForEmail(childLastName)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>ID studenta:</strong> ${escapeHtmlForEmail(studentId)}</p>
        ${emailInsetCellClose()}
        ${emailInsetCellOpen(p)}
          <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>Rodzic:</strong> ${escapeHtmlForEmail(parentFirstName)} ${escapeHtmlForEmail(parentLastName)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>Email:</strong> ${buildEmailMailtoLink(parentEmail, p.insetText)}</p>
        ${emailInsetCellClose()}
        <div style="border:2px solid #dc2626;background:#3b1a1a;padding:14px 16px;border-radius:10px;margin-top:12px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#fca5a5;">Powód rezygnacji</p>
          <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;color:${p.text};">${escapeHtmlForEmail(reason)}</p>
        </div>
      `,
      footerHtml: `${buildEmailFooterBrandLine({ marginTop: "0", brandColor: p.accentWarm })}<p style="margin:0;font-size:12px;color:${p.text};">System automatycznego powiadamiania</p>`,
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

  await sendHarryMail(mailOptions);
}

export function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Adres e-mail w treści HTML — biały link mailto (bez niebieskiego auto-linkowania w kliencie poczty). */
function buildEmailMailtoLink(
  email: string,
  color?: string,
  options?: { underline?: boolean }
): string {
  const c = color ?? getEmailPalette().text;
  const safe = escapeHtmlForEmail(email.trim());
  const deco = options?.underline ? "underline" : "none";
  return `<a href="mailto:${safe}" class="he-email-body-link" style="color:${c} !important;-webkit-text-fill-color:${c} !important;text-decoration:${deco} !important;">${safe}</a>`;
}

function splitTrailingUrlPunctuation(token: string): { url: string; suffix: string } {
  const comma = token.match(/^(.+?)([,;:!?)]+)$/);
  if (comma) return { url: comma[1], suffix: comma[2] };
  const sentenceDot = token.match(/^(.+\.[a-z]{2,})\.$/i);
  if (sentenceDot) return { url: sentenceDot[1], suffix: "." };
  return { url: token, suffix: "" };
}

function emailBodyLinkInlineStyle(color: string): string {
  return `color:${color} !important;text-decoration:underline;-webkit-text-fill-color:${color} !important;`;
}

function buildEmailBodyLinkStylesCss(textColor: string): string {
  return `
      a.he-email-body-link,
      a.he-email-body-link:link,
      a.he-email-body-link:visited,
      a.he-email-body-link:hover,
      a.he-email-body-link:active {
        color: ${textColor} !important;
        text-decoration: underline !important;
        -webkit-text-fill-color: ${textColor} !important;
      }
      a[href^="mailto:"],
      a[href^="mailto:"]:link,
      a[href^="mailto:"]:visited,
      a[href^="mailto:"]:hover,
      a[href^="mailto:"]:active,
      a[x-apple-data-detectors] {
        color: ${textColor} !important;
        -webkit-text-fill-color: ${textColor} !important;
      }`;
}

/** Zamienia URL w już escapowanym tekście na linki w kolorze treści (bez niebieskiego / visited). */
function linkifyEscapedEmailText(escaped: string, textColor: string): string {
  const style = emailBodyLinkInlineStyle(textColor);
  const anchor = (href: string, label: string) =>
    `<a class="he-email-body-link" href="${href}" target="_blank" rel="noopener noreferrer" style="${style}">${label}</a>`;

  const withHttp = escaped.replace(/https?:\/\/[^\s<&]+/gi, (raw) => {
    const { url, suffix } = splitTrailingUrlPunctuation(raw);
    if (!url) return raw;
    return anchor(url, url) + suffix;
  });

  return withHttp.replace(/(^|[\s(])(www\.[^\s<&]+)/gi, (full, lead, wwwRaw) => {
    const { url, suffix } = splitTrailingUrlPunctuation(wwwRaw);
    if (!url) return full;
    return `${lead}${anchor(`https://${url}`, url)}${suffix}`;
  });
}

/** Akapity i łamanie linii z pola tekstowego — treść główna maila direct. */
function formatPlainTextAsEmailHtml(
  content: string,
  textColor?: string,
  linkColor?: string
): string {
  const p = getEmailPalette();
  const text = textColor ?? p.insetText;
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const link = linkColor ?? text;
  if (!normalized) {
    return `<p style="margin:0;font-size:15px;line-height:1.7;color:${text};opacity:0.75;">(brak treści)</p>`;
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = linkifyEscapedEmailText(escapeHtmlForEmail(paragraph), link)
        .split("\n")
        .join("<br />");
      return `<p style="margin:0 0 1em 0;font-size:16px;line-height:1.75;color:${text};">${lines}</p>`;
    })
    .join("\n        ");
}

export function buildDirectMessageEmailBodyHtml(
  content: string,
  palette: EmailPalette = getEmailPalette()
): string {
  const messageHtml = formatPlainTextAsEmailHtml(
    content,
    palette.insetText,
    palette.insetLink
  );
  return `
        ${emailInsetCellOpen(palette)}
              ${messageHtml}
        ${emailInsetCellClose()}`;
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
  const p = getEmailPalette();

  const childrenBlocks = params.children
    .map(
      (ch) => `
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td bgcolor="${p.insetBg}" style="border:1px solid ${p.insetBorder};${emailSolidCellStyle(p.insetBg, p.insetText)}padding:14px 16px;font-family:${BRAND_FONT};font-size:14px;line-height:1.6;">
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

  await sendHarryMail({
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
        ${emailInsetCellOpen(p)}
          <strong style="color:${p.insetText};">Dane rodzica</strong><br />
          <span style="color:${p.insetText};">Imię: ${escapeHtmlForEmail(params.parentFirstName)}<br />
          Nazwisko: ${escapeHtmlForEmail(params.parentLastName)}</span>
        ${emailInsetCellClose()}
        ${emailSectionHeading("Lista dzieci", p)}
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
- Facebook: ${FACEBOOK_URL}
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
  const p = getEmailPalette();
  const subjectPrefix = params.dbSaveOk
    ? "[ZGŁOSZENIE] Formularz (zapis w bazie OK)"
    : "[ZGŁOSZENIE] UWAGA: błąd zapisu w bazie";

  const rowsHtml = params.children
    .map(
      (ch) => `
          <tr>
            <td style="padding:8px;border:1px solid ${p.insetBorder};color:${p.insetText};">${ch.index}</td>
            <td style="padding:8px;border:1px solid ${p.insetBorder};color:${p.insetText};">${escapeHtmlForEmail(ch.firstName)}</td>
            <td style="padding:8px;border:1px solid ${p.insetBorder};color:${p.insetText};">${escapeHtmlForEmail(ch.lastName)}</td>
            <td style="padding:8px;border:1px solid ${p.insetBorder};color:${p.insetText};">${escapeHtmlForEmail(ch.birthDate)}</td>
            <td style="padding:8px;border:1px solid ${p.insetBorder};color:${p.insetText};">${escapeHtmlForEmail(ch.preferredLocationLabel)}</td>
          </tr>`
    )
    .join("");

  const dbNote = params.dbSaveOk
    ? "<p><strong>Status:</strong> Zapis w bazie zakończył się powodzeniem (wiadomość informacyjna).</p>"
    : `<p style="color:${p.accentWarm};"><strong>Status:</strong> Zapis w bazie nie powiódł się — sprawdź bazę i wpisz zgłoszenie ręcznie.</p>
       <p style="font-size:13px;"><strong>Komunikat błędu (techniczny):</strong> ${escapeHtmlForEmail(params.dbErrorMessage ?? "(brak)")}</p>`;

  const textChildren = params.children
    .map(
      (ch) =>
        `${ch.index}. ${ch.firstName} ${ch.lastName}, ur. ${ch.birthDate}, lokalizacja: ${ch.preferredLocationLabel}`
    )
    .join("\n");

  await sendHarryMail({
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
        ${emailSectionHeading("Szkoła", p)}
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:${p.text};"><strong>Nazwa:</strong> ${escapeHtmlForEmail(params.schoolName)}</p>
        ${emailSectionHeading("Rodzic", p)}
        <ul style="margin:0 0 12px 18px;padding:0;font-size:14px;line-height:1.6;color:${p.text};">
          <li><strong>Imię:</strong> ${escapeHtmlForEmail(params.parentFirstName)}</li>
          <li><strong>Nazwisko:</strong> ${escapeHtmlForEmail(params.parentLastName)}</li>
          <li><strong>Email:</strong> ${buildEmailMailtoLink(params.parentEmail, p.text)}</li>
          <li><strong>Telefon:</strong> ${escapeHtmlForEmail(params.parentPhone)}</li>
          <li><strong>Zgoda RODO:</strong> ${params.rodoConsent ? "tak" : "nie"}</li>
        </ul>
        ${emailSectionHeading("Dzieci", p)}
        <table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px;">
          <thead>
            <tr bgcolor="${p.insetBg}" style="background-color:${p.insetBg};">
              <th style="padding:8px;border:1px solid ${p.insetBorder};text-align:left;color:${p.insetText};">#</th>
              <th style="padding:8px;border:1px solid ${p.insetBorder};text-align:left;color:${p.insetText};">Imię</th>
              <th style="padding:8px;border:1px solid ${p.insetBorder};text-align:left;color:${p.insetText};">Nazwisko</th>
              <th style="padding:8px;border:1px solid ${p.insetBorder};text-align:left;color:${p.insetText};">Data ur.</th>
              <th style="padding:8px;border:1px solid ${p.insetBorder};text-align:left;color:${p.insetText};">Preferowana lokalizacja</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin:14px 0 0 0;font-size:12px;color:${p.text};opacity:0.85;">Wiadomość wygenerowana automatycznie — kopia zapasowa treści formularza.</p>
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

export async function sendMessageNotificationEmail(params: {
  to: string;
  recipientName: string;
  senderName: string;
  senderRole: "MANAGER" | "TEACHER";
  subject: string;
  contentPreview: string;
  portalUrl: string;
  /** Wysyłka z sekcji „Wyślij e-mail” — bez informacji o panelu; odpowiedź na ten mail. */
  deliveryMode?: "portal" | "direct-email";
  replyTo?: string;
}): Promise<void> {
  const isDirectEmail = params.deliveryMode === "direct-email";
  const messageBody = params.contentPreview;
  const preview =
    isDirectEmail || messageBody.length <= 200
      ? messageBody
      : `${messageBody.slice(0, 200)}…`;
  const roleLabel =
    params.senderRole === "MANAGER" ? "Zarządca szkoły" : "Nauczyciel";
  const portalLink = params.portalUrl.replace(/\/$/, "");
  const mailFrom = process.env.EMAIL_USER || "kontakt@harry-english.pl";

  const p = getEmailPalette();
  const portalCtaHtml = emailCtaButton(`${portalLink}/portal`, "Przejdź do panelu");

  const portalContentHtml = `
        <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:${p.text};"><strong style="color:${p.accentWarm};">Temat:</strong> ${escapeHtmlForEmail(params.subject)}</p>
        ${emailInsetCellOpen(p)}
              <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;color:${p.insetText};">${linkifyEscapedEmailText(escapeHtmlForEmail(preview), p.insetLink)}</p>
        ${emailInsetCellClose()}
        ${portalCtaHtml}`;

  const directContentHtml = buildDirectMessageEmailBodyHtml(messageBody, p);

  const replyToAddress = params.replyTo?.trim();
  const shellTitle = isDirectEmail
    ? escapeHtmlForEmail(params.subject)
    : `Dzień dobry ${escapeHtmlForEmail(params.recipientName)},`;
  const shellIntro = isDirectEmail
    ? undefined
    : `Otrzymałeś/aś nową wiadomość od ${escapeHtmlForEmail(params.senderName)} (${roleLabel}).`;
  const shellFooter = isDirectEmail
    ? buildDirectMessageEmailFooter(p)
    : buildMessageEmailFooter(p);
  const shellHtml = buildEmailShell({
    title: shellTitle,
    intro: shellIntro,
    contentHtml: isDirectEmail ? directContentHtml : portalContentHtml,
    footerHtml: shellFooter,
    palette: p,
  });

  await sendHarryMail({
    from: {
      name: "Harry English",
      address: mailFrom,
    },
    to: params.to,
    ...(isDirectEmail && replyToAddress
      ? {
          replyTo: {
            name: params.senderName,
            address: replyToAddress,
          },
        }
      : {}),
    subject: isDirectEmail ? params.subject : `Nowa wiadomość: ${params.subject}`,
    html: shellHtml,
    text: isDirectEmail
      ? `${params.subject}

${messageBody}

Opinie Google: ${GOOGLE_REVIEWS_URL}
Facebook: ${FACEBOOK_URL}

Harry English`
      : `Dzień dobry ${params.recipientName},

Otrzymałeś/aś nową wiadomość od ${params.senderName} (${roleLabel}).

Temat: ${params.subject}

${preview}

Przejdź do panelu: ${portalLink}/portal

Aby odpowiedzieć, zaloguj się do panelu. Nie odpowiadaj na tę wiadomość.

Opinie Google: ${GOOGLE_REVIEWS_URL}
Facebook: ${FACEBOOK_URL}

Harry English`,
  });
}

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
    childFirstName?: string;
    childLastName?: string;
  },
  /** Mail uzupełniający po negocjacji — bez danych logowania (rodzic ma już konto). */
) {
  const portalUrl = `${getAppBaseUrl()}/portal/login`;
  const p = getEmailPalette();
  const safeChildName =
    proposal.childFirstName != null && proposal.childLastName != null
      ? `${escapeHtmlForEmail(proposal.childFirstName)} ${escapeHtmlForEmail(proposal.childLastName)}`
      : "Twojego dziecka";
  const childNameText =
    proposal.childFirstName != null && proposal.childLastName != null
      ? `${proposal.childFirstName} ${proposal.childLastName}`
      : "Twojego dziecka";

  const loginHtml = `
      <p style="margin:16px 0 8px 0;font-size:15px;line-height:1.6;color:${p.text};">
        Aby zobaczyć szczegóły propozycji i podjąć decyzję, zaloguj się do portalu danymi, których używasz na co dzień.
      </p>
      <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:${p.text};opacity:0.85;">
        Nie pamiętasz hasła? Skorzystaj z opcji „Zapomniałem hasła" na stronie logowania.
      </p>
    `;

  const loginText = `
Zaloguj się do portalu danymi, których używasz na co dzień.
Nie pamiętasz hasła? Skorzystaj z opcji "Zapomniałem hasła" na stronie logowania.
`;

  await sendHarryMail({
    from: {
      name: "Harry English",
      address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
    },
    to,
    subject: "Nowa propozycja grupy - Harry English",
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(parentName)},`,
      intro: `Przygotowaliśmy nową propozycję grupy dla ${safeChildName}. Zaakceptuj ją w portalu, aby przejść dalej w procesie zapisu.`,
      contentHtml: `
        <ul style="margin:0 0 12px 18px;padding:0;font-size:15px;line-height:1.6;color:${p.text};">
          <li><strong>Grupa:</strong> ${escapeHtmlForEmail(proposal.groupName)}</li>
          <li><strong>Lokalizacja:</strong> ${escapeHtmlForEmail(proposal.locationName)}</li>
          <li><strong>Termin:</strong> ${escapeHtmlForEmail(proposal.schedule)}</li>
        </ul>
        ${loginHtml}
        ${emailCtaButton(portalUrl, "Przejdź do portalu")}
        <p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;color:${p.text};">
          Lub skopiuj link do przeglądarki: <a href="${portalUrl}" class="he-email-body-link" style="color:${p.link} !important;">${portalUrl}</a>
        </p>
      `,
    }),
    text: `Dzień dobry ${parentName},

Przygotowaliśmy nową propozycję grupy dla ${childNameText}. Zaakceptuj ją w portalu, aby przejść dalej w procesie zapisu:
- Grupa: ${proposal.groupName}
- Lokalizacja: ${proposal.locationName}
- Termin: ${proposal.schedule}
${loginText}
Przejdź do portalu: ${portalUrl}
`,
  });
}

export async function sendCombinedProposalEmail(
  to: string,
  parentName: string,
  proposals: Array<{
    groupName: string;
    locationName: string;
    schedule: string;
    childFirstName: string;
    childLastName: string;
  }>,
  login: {
    loginEmail: string;
    /** null = istniejące konto — nie podajemy nowego hasła */
    tempPassword: string | null;
  }
) {
  const portalUrl = `${getAppBaseUrl()}/portal/login`;
  const p = getEmailPalette();

  const proposalsHtml = proposals
    .map((proposal) => {
      const safeChildName = `${escapeHtmlForEmail(proposal.childFirstName)} ${escapeHtmlForEmail(proposal.childLastName)}`;
      return `
        <div style="margin:0 0 16px 0;padding:14px 16px;border:2px solid ${p.insetBorder};border-radius:10px;background:${p.insetBg};">
          <p style="margin:0 0 8px 0;font-size:15px;font-weight:700;color:${p.text};">${safeChildName}</p>
          <ul style="margin:0 0 0 18px;padding:0;font-size:15px;line-height:1.6;color:${p.text};">
            <li><strong>Grupa:</strong> ${escapeHtmlForEmail(proposal.groupName)}</li>
            <li><strong>Lokalizacja:</strong> ${escapeHtmlForEmail(proposal.locationName)}</li>
            <li><strong>Termin:</strong> ${escapeHtmlForEmail(proposal.schedule)}</li>
          </ul>
        </div>
      `;
    })
    .join("");

  const proposalsText = proposals
    .map((proposal) => {
      const childName = `${proposal.childFirstName} ${proposal.childLastName}`;
      return `${childName}:
- Grupa: ${proposal.groupName}
- Lokalizacja: ${proposal.locationName}
- Termin: ${proposal.schedule}`;
    })
    .join("\n\n");

  const isNewAccount = Boolean(login.tempPassword);
  const passwordHtml = isNewAccount
    ? `<strong>${escapeHtmlForEmail(login.tempPassword!)}</strong>`
    : `<strong>użyj obecnego hasła</strong>`;
  const passwordText = isNewAccount
    ? login.tempPassword!
    : "użyj obecnego hasła";

  const credentialsHtml = `
      <p style="margin:16px 0 8px 0;font-size:15px;line-height:1.6;color:${p.text};">
        ${
          isNewAccount
            ? "Założyliśmy dla Ciebie konto w portalu. Zaloguj się poniższymi danymi."
            : "Zaloguj się do portalu poniższymi danymi (konto już masz w systemie)."
        }
      </p>
      ${emailInsetCellOpen(p)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
        <tr>
          <td style="padding:4px 12px 4px 0;font-size:15px;color:${p.insetText};"><strong>Login (email):</strong></td>
          <td style="padding:4px 0;font-size:15px;color:${p.insetText};font-family:Consolas,Menlo,monospace;">
            ${buildEmailMailtoLink(login.loginEmail, p.insetText)}
          </td>
        </tr>
        <tr>
          <td style="padding:4px 12px 4px 0;font-size:15px;color:${p.insetText};"><strong>${isNewAccount ? "Hasło tymczasowe:" : "Hasło:"}</strong></td>
          <td style="padding:4px 0;font-size:16px;color:${p.insetText};font-family:Consolas,Menlo,monospace;letter-spacing:1px;">${passwordHtml}</td>
        </tr>
      </table>
      ${emailInsetCellClose()}
      <p style="margin:12px 0;font-size:14px;line-height:1.6;color:${p.text};opacity:0.85;">
        ${
          isNewAccount
            ? "Po pierwszym zalogowaniu poprosimy Cię o ustawienie własnego hasła."
            : "Nie pamiętasz hasła? Skorzystaj z opcji „Zapomniałem hasła” na stronie logowania."
        }
      </p>
    `;

  const credentialsText = `
${
  isNewAccount
    ? "Założyliśmy dla Ciebie konto w portalu. Zaloguj się poniższymi danymi."
    : "Zaloguj się do portalu poniższymi danymi (konto już masz w systemie)."
}
- Login (email): ${login.loginEmail}
- ${isNewAccount ? "Hasło tymczasowe" : "Hasło"}: ${passwordText}
${
  isNewAccount
    ? "Po pierwszym zalogowaniu poprosimy Cię o ustawienie własnego hasła."
    : "Nie pamiętasz hasła? Skorzystaj z opcji \"Zapomniałem hasła\" na stronie logowania."
}
`;

  const childCount = proposals.length;
  const introPlural =
    childCount === 1
      ? "Przygotowaliśmy propozycję grupy dla Twojego dziecka."
      : `Przygotowaliśmy propozycje grup dla ${childCount} dzieci.`;

  await sendHarryMail({
    from: {
      name: "Harry English",
      address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
    },
    to,
    subject:
      childCount === 1
        ? "Propozycja grupy - Harry English"
        : `Propozycje grup (${childCount} dzieci) - Harry English`,
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(parentName)},`,
      intro: `${introPlural} Zaakceptuj je w portalu, aby przejść do uzupełnienia danych oraz do podpisania umowy.`,
      contentHtml: `
        ${proposalsHtml}
        ${credentialsHtml}
        ${emailCtaButton(portalUrl, "Przejdź do portalu")}
        <p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;color:${p.text};">
          Lub skopiuj link do przeglądarki: <a href="${portalUrl}" class="he-email-body-link" style="color:${p.link} !important;">${portalUrl}</a>
        </p>
      `,
    }),
    text: `Dzień dobry ${parentName},

${introPlural} Zaakceptuj je w portalu, aby przejść do uzupełnienia danych oraz do podpisania umowy.

${proposalsText}
${credentialsText}
Przejdź do portalu: ${portalUrl}
`,
  });
}

/**
 * Powiadomienie dla szkoły, że rodzic odrzucił propozycję grupy.
 * Wysyłane na `process.env.EMAIL_USER` (kontakt@harry-english.pl).
 * `reason` jest opcjonalny — jeśli rodzic nie wpisał komentarza, podaj `null`.
 */
export async function sendProposalRejectedEmail(params: {
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  childFirstName: string;
  childLastName: string;
  groupName: string;
  locationName: string;
  schedule: string;
  reason: string | null;
}): Promise<void> {
  const fromAddr = process.env.EMAIL_USER || "kontakt@harry-english.pl";
  const adminTo = process.env.EMAIL_USER || "kontakt@harry-english.pl";
  const p = getEmailPalette();

  const reasonHtml = params.reason
    ? `
      <div style="border:2px solid #f59e0b;background:#3d3420;padding:14px 16px;border-radius:10px;margin-top:12px;">
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:${p.accentWarm};">Komentarz rodzica</p>
        <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;color:${p.text};">${escapeHtmlForEmail(params.reason)}</p>
      </div>
    `
    : `
      <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:${p.text};opacity:0.85;">
        Rodzic nie podał powodu odrzucenia.
      </p>
    `;

  const reasonText = params.reason
    ? `Komentarz rodzica:\n${params.reason}\n`
    : `Rodzic nie podał powodu odrzucenia.\n`;

  await sendHarryMail({
    from: {
      name: "Harry English",
      address: fromAddr,
    },
    to: adminTo,
    subject: `Odrzucono propozycję grupy — ${params.childFirstName} ${params.childLastName}`,
    html: buildEmailShell({
      title: "Rodzic odrzucił propozycję grupy",
      intro: `Rodzic ${escapeHtmlForEmail(params.parentFirstName)} ${escapeHtmlForEmail(params.parentLastName)} odrzucił propozycję dla dziecka ${escapeHtmlForEmail(params.childFirstName)} ${escapeHtmlForEmail(params.childLastName)}.`,
      contentHtml: `
        ${emailInsetCellOpen(p)}
          <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>Dziecko:</strong> ${escapeHtmlForEmail(params.childFirstName)} ${escapeHtmlForEmail(params.childLastName)}</p>
          <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>Rodzic:</strong> ${escapeHtmlForEmail(params.parentFirstName)} ${escapeHtmlForEmail(params.parentLastName)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:${p.insetText};"><strong>Email rodzica:</strong> ${buildEmailMailtoLink(params.parentEmail, p.insetText)}</p>
        ${emailInsetCellClose()}
        ${emailInsetCellOpen(p)}
          ${emailSectionHeading("Odrzucona propozycja", p)}
          <ul style="margin:0 0 0 18px;padding:0;font-size:14px;line-height:1.6;color:${p.insetText};">
            <li><strong>Grupa:</strong> ${escapeHtmlForEmail(params.groupName)}</li>
            <li><strong>Lokalizacja:</strong> ${escapeHtmlForEmail(params.locationName)}</li>
            <li><strong>Termin:</strong> ${escapeHtmlForEmail(params.schedule)}</li>
          </ul>
        ${emailInsetCellClose()}
        ${reasonHtml}
        <p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;color:${p.text};opacity:0.85;">
          Skontaktuj się z rodzicem bezpośrednio — w systemie nie wyślesz kolejnej propozycji grupy.
        </p>
      `,
      footerHtml: `${buildEmailFooterBrandLine({ marginTop: "0", brandColor: p.accentWarm })}<p style="margin:0;font-size:12px;color:${p.text};">System automatycznego powiadamiania</p>`,
    }),
    text: `Rodzic odrzucił propozycję grupy

Dziecko: ${params.childFirstName} ${params.childLastName}
Rodzic: ${params.parentFirstName} ${params.parentLastName}
Email rodzica: ${params.parentEmail}

Odrzucona propozycja:
- Grupa: ${params.groupName}
- Lokalizacja: ${params.locationName}
- Termin: ${params.schedule}

${reasonText}
Skontaktuj się z rodzicem bezpośrednio — w systemie nie wyślesz kolejnej propozycji grupy.

Harry English
System automatycznego powiadamiania
`,
  });
}

export async function sendContractEmail(
  to: string,
  parentName: string,
  contractHtml: string
) {
  const p = getEmailPalette();
  await sendHarryMail({
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
        <hr style="border:none;border-top:1px solid ${p.insetBorder};margin:0 0 12px 0;" />
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
  const p = getEmailPalette();
  const recipients = [parentEmail, "kontakt@harry-english.pl"];
  await sendHarryMail({
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
        <hr style="border:none;border-top:1px solid ${p.insetBorder};margin:0 0 12px 0;" />
        ${contractHtml}
      `,
    }),
    text: "Umowa została podpisana elektronicznie. Szczegóły znajdują się w wersji HTML wiadomości.",
  });
}

export type SignedContractPdfAttachment = {
  filename: string;
  content: Buffer;
};

export async function sendSignedContractConfirmationEmails(params: {
  parentEmail: string;
  parentFirstName: string;
  parentFullName: string;
  contractNumber: string | null;
  childName?: string | null;
  schoolEmail?: string;
  pdfFiles: SignedContractPdfAttachment[];
}) {
  const from = {
    name: "Harry English",
    address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
  };
  const schoolEmail = params.schoolEmail?.trim() || "kontakt@harry-english.pl";
  const contractLabel = params.contractNumber ? ` nr ${params.contractNumber}` : "";
  const childPart = params.childName?.trim() ? ` Dotyczy: ${params.childName.trim()}.` : "";
  const attachmentList = params.pdfFiles.map((file) => ({
    filename: file.filename,
    content: file.content,
    contentType: "application/pdf" as const,
  }));

  const filesListHtml = params.pdfFiles
    .map((file) => `<li>${escapeHtmlForEmail(file.filename)}</li>`)
    .join("");

  const sharedContentHtml = `
    <p>Umowa${escapeHtmlForEmail(contractLabel)} została podpisana elektronicznie.${escapeHtmlForEmail(childPart)}</p>
    <p>W załączeniu przesyłamy podpisane dokumenty w formacie PDF:</p>
    <ul style="margin:8px 0;padding-left:20px;">${filesListHtml}</ul>
  `;

  const sharedText = `Umowa${contractLabel} została podpisana.${childPart} W załączeniu: ${params.pdfFiles.map((f) => f.filename).join(", ")}.`;

  await sendHarryMail({
    from,
    to: params.parentEmail,
    subject: "Potwierdzenie podpisania umowy - Harry English",
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(params.parentFirstName)},`,
      intro: "Dziękujemy za podpisanie umowy.",
      contentHtml: sharedContentHtml,
    }),
    text: `Dzień dobry ${params.parentFirstName}, dziękujemy za podpisanie umowy. ${sharedText}`,
    attachments: attachmentList,
  });

  await sendHarryMail({
    from,
    to: schoolEmail,
    subject: `Podpisana umowa${contractLabel} - ${params.parentFullName} - Harry English`,
    html: buildEmailShell({
      title: "Podpisana umowa",
      intro: `Rodzic ${escapeHtmlForEmail(params.parentFullName)} podpisał umowę${escapeHtmlForEmail(contractLabel)}.`,
      contentHtml: sharedContentHtml,
    }),
    text: `Rodzic ${params.parentFullName} podpisał umowę${contractLabel}. ${sharedText}`,
    attachments: attachmentList,
  });
}

export async function sendInvoiceNotificationEmail(params: {
  parentEmail: string;
  parentFirstName: string;
  amountLabel: string;
  description: string;
  periodLabel?: string | null;
  dueDateLabel: string;
  schoolEmail?: string;
}) {
  const p = getEmailPalette();
  const from = {
    name: "Harry English",
    address: process.env.EMAIL_USER || "kontakt@harry-english.pl",
  };
  const schoolEmail = params.schoolEmail?.trim() || "kontakt@harry-english.pl";
  const portalUrl = `${getAppBaseUrl()}/portal/login`;
  const periodPart = params.periodLabel?.trim()
    ? `<p><strong>Okres:</strong> ${escapeHtmlForEmail(params.periodLabel.trim())}</p>`
    : "";
  const contentHtml = `
    <p>Wystawiliśmy nową fakturę. <strong>Faktury nie wysyłamy mailem</strong> — dokument PDF jest do pobrania w panelu rodzica (zakładka <strong>Płatności</strong>).</p>
    <p><strong>Opis:</strong> ${escapeHtmlForEmail(params.description)}</p>
    ${periodPart}
    <p><strong>Kwota:</strong> ${escapeHtmlForEmail(params.amountLabel)}</p>
    <p><strong>Termin płatności:</strong> ${escapeHtmlForEmail(params.dueDateLabel)}</p>
    ${emailCtaButton(portalUrl, "Przejdź do panelu rodzica")}
    <p>W razie pytań prosimy o kontakt: <a href="mailto:${escapeHtmlForEmail(schoolEmail)}" style="color:${p.link};">${escapeHtmlForEmail(schoolEmail)}</a>.</p>
  `;
  const textPeriod = params.periodLabel?.trim() ? ` Okres: ${params.periodLabel.trim()}.` : "";
  const textBody = `Wystawiono fakturę (do pobrania w panelu rodzica / Płatności): ${params.description}.${textPeriod} Kwota: ${params.amountLabel}. Termin płatności: ${params.dueDateLabel}. Panel: ${portalUrl}. Kontakt: ${schoolEmail}.`;

  await sendHarryMail({
    from,
    to: params.parentEmail,
    subject: "Nowa faktura w panelu rodzica — Harry English",
    html: buildEmailShell({
      title: `Dzień dobry ${escapeHtmlForEmail(params.parentFirstName)},`,
      intro: "Faktura jest gotowa do pobrania w panelu rodzica.",
      contentHtml,
    }),
    text: `Dzień dobry ${params.parentFirstName}, ${textBody}`,
  });
}
