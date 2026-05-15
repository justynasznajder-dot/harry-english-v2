import { NextResponse } from "next/server";
import { buildEmailShell, escapeHtmlForEmail } from "@/lib/email";

/**
 * Podgląd szablonu maila (tylko development).
 * Otwórz: http://localhost:3000/api/dev/email-preview
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const html = buildEmailShell({
    title: "Potwierdzenie otrzymania zgłoszenia",
    intro:
      "Dziękujemy - Twoje zgłoszenie dotarło. Odezwiemy się do Ciebie wkrótce, aby ustalić szczegóły.",
    contentHtml: `
        <div style="border:1px solid #d9e0db;background:#f8faf8;padding:14px 16px;border-radius:10px;margin-bottom:14px;font-size:14px;line-height:1.6;">
          <strong>Dane rodzica</strong><br />
          Imię: ${escapeHtmlForEmail("Jan")}<br />
          Nazwisko: ${escapeHtmlForEmail("Kowalski")}
        </div>
        <p style="margin:0 0 10px 0;font-size:18px;line-height:1.4;font-weight:700;color:#175244;">Lista dzieci</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="border:1px solid #d9e0db;background:#ffffff;padding:14px 16px;font-size:14px;line-height:1.6;">
              <strong>Dziecko 1</strong><br />
              Imię: ${escapeHtmlForEmail("Anna")}<br />
              Nazwisko: ${escapeHtmlForEmail("Kowalska")}
            </td>
          </tr>
        </table>
      `,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
