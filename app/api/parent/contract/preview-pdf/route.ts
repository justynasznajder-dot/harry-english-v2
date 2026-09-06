import { NextRequest, NextResponse } from "next/server";

import { buildContractPdfFilename, renderHtmlToPdf } from "@/lib/contract-pdf";
import { extractContractNumber } from "@/lib/contract-html";
import { getUserById } from "@/lib/db";
import { fetchParentContractForPortal } from "@/lib/parent-contract";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { buildPickupConsentPdfFilename } from "@/lib/pickup-consent-notice";
import { isComplimentaryForParent } from "@/lib/school-discounts";

/** Chromium PDF — dłużej niż domyślne 10 s. */
export const maxDuration = 60;
export const runtime = "nodejs";

function withUnsignedPreviewBanner(html: string, isSigned: boolean): string {
  if (isSigned) return html;
  const banner = `<div style="margin:0 0 16px;padding:10px 14px;border:1px solid #f59e0b;background:#fffbeb;color:#78350f;font:600 13px/1.4 system-ui,sans-serif;border-radius:8px;">PODGLĄD — dokument jeszcze niepodpisany. Po akceptacji w portalu wygenerujemy ostateczny PDF.</div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
  }
  return `${banner}${html}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;
  const doc = (request.nextUrl.searchParams.get("doc") ?? "contract").trim().toLowerCase();
  const childId = request.nextUrl.searchParams.get("childId")?.trim() ?? "";

  try {
    const parentUser = await getUserById(parentId);
    const complimentary = await isComplimentaryForParent(schoolId, {
      parentId,
      parentEmail: parentUser?.email,
    });
    // W trybie bez opłat: tylko zgoda na odbiór; umowa i wizerunek niedostępne.
    if (complimentary && doc !== "attachment2") {
      return NextResponse.json(
        { message: "Tryb bez opłat — wcześniejsze dokumenty nie są dostępne do pobrania" },
        { status: 403 },
      );
    }

    const contract = await fetchParentContractForPortal(parentId, schoolId);
    if (!contract) {
      return NextResponse.json({ message: "Brak umowy do podglądu" }, { status: 404 });
    }

    const isSigned = contract.status === "SIGNED";
    let html: string | null = null;
    let filename = "umowa-podglad.pdf";

    if (doc === "contract") {
      const contentHtml = contract.content_html;
      if (!contentHtml) {
        return NextResponse.json({ message: "Brak umowy do podglądu" }, { status: 404 });
      }
      html = withUnsignedPreviewBanner(contentHtml, isSigned);
      filename = buildContractPdfFilename(
        isSigned ? "Umowa" : "Umowa-podglad",
        extractContractNumber(contentHtml),
      );
    } else if (doc === "attachment1" || doc === "attachment2") {
      if (!childId) {
        return NextResponse.json({ message: "Brak childId dla załącznika" }, { status: 400 });
      }
      const child = contract.child_attachments.find((c) => c.child_id === childId);
      if (!child) {
        return NextResponse.json({ message: "Nie znaleziono załącznika" }, { status: 404 });
      }
      const childName = `${child.first_name} ${child.last_name}`.trim();
      if (doc === "attachment1") {
        html = child.attachment_1_html;
        if (!html) {
          return NextResponse.json({ message: "Brak załącznika nr 1" }, { status: 404 });
        }
        html = withUnsignedPreviewBanner(html, isSigned);
        filename = buildContractPdfFilename(
          isSigned ? `Zalacznik-1-wizerunek` : `Zalacznik-1-podglad`,
          extractContractNumber(contract.content_html ?? ""),
        );
      } else {
        html = child.attachment_2_html;
        if (!html) {
          return NextResponse.json({ message: "Brak zgody na odebranie" }, { status: 404 });
        }
        html = withUnsignedPreviewBanner(html, isSigned);
        filename = isSigned
          ? buildPickupConsentPdfFilename(childName || "dziecko")
          : `Zgoda-odbior-podglad-${childName || "dziecko"}.pdf`.replace(/\s+/g, "-");
      }
    } else {
      return NextResponse.json({ message: "Nieznany typ dokumentu" }, { status: 400 });
    }

    if (!html) {
      return NextResponse.json({ message: "Brak treści dokumentu" }, { status: 404 });
    }

    const pdf = await renderHtmlToPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/parent/contract/preview-pdf:", error);
    return NextResponse.json({ message: "Nie udało się wygenerować PDF" }, { status: 500 });
  }
}
