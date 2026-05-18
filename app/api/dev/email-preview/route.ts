import { NextResponse } from "next/server";
import {
  buildDirectMessageEmailBodyHtml,
  buildDirectMessageEmailFooter,
  buildEmailShell,
  escapeHtmlForEmail,
} from "@/lib/email";

/**
 * Podgląd szablonu maila (tylko development).
 * http://localhost:3000/api/dev/email-preview
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sampleBody = `Drodzy Rodzice,

Z radością informujemy, że zapisy na rok szkolny 2026/27 są już otwarte!

Więcej informacji na stronie www.harry-english.pl`;

  const html = buildEmailShell({
    title: "Zapisy otwarte!",
    contentHtml: buildDirectMessageEmailBodyHtml(sampleBody),
    footerHtml: buildDirectMessageEmailFooter(),
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
