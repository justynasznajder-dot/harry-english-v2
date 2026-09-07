import { extractContractNumber } from "@/lib/contract-html";
import {
  buildImageConsentPdfFilename,
  IMAGE_CONSENT_PDF_TITLE,
} from "@/lib/image-consent-notice";
import { buildPickupConsentPdfFilename } from "@/lib/pickup-consent-notice";

export type ContractPdfFile = {
  filename: string;
  content: Buffer;
};

/** Re-export dla kodu serwerowego — klient nie powinien importować tego pliku. */
export { buildImageConsentPdfFilename, IMAGE_CONSENT_PDF_TITLE };

function safePdfSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function buildContractPdfFilename(label: string, contractNumber: string | null): string {
  const suffix = contractNumber ? safePdfSlug(contractNumber.replace(/\//g, "-")) : "dokument";
  return `${safePdfSlug(label)}-${suffix}.pdf`;
}

function sanitizePdfDisplayName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ");
}

function sanitizeContractNumberForFilename(contractNumber: string | null | undefined): string | null {
  const raw = String(contractNumber ?? "").trim();
  if (!raw) return null;
  return raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "");
}

/** `Umowa _ Imię Nazwisko _ 00035-2-2026.pdf` */
export function buildUmowaPdfFilename(
  childFullName: string,
  contractNumber?: string | null
): string {
  const name = sanitizePdfDisplayName(childFullName);
  const number = sanitizeContractNumberForFilename(contractNumber);
  const base = `Umowa _ ${name || "dziecko"}`;
  return number ? `${base} _ ${number}.pdf` : `${base}.pdf`;
}

function isServerlessRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

type PdfBrowser = {
  newPage: () => Promise<{
    setContent: (html: string, options?: { waitUntil?: string; timeout?: number }) => Promise<void>;
    pdf: (options: {
      format: string;
      printBackground: boolean;
      margin: { top: string; right: string; bottom: string; left: string };
    }) => Promise<Uint8Array>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

async function launchPdfBrowser(): Promise<PdfBrowser> {
  if (isServerlessRuntime()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;
    // WebGL / SwiftShader często pada na Vercel — wyłączamy grafiki.
    chromium.setGraphicsMode = false;
    return (await puppeteer.launch({
      args: puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: "shell",
    })) as unknown as PdfBrowser;
  }

  const puppeteer = (await import("puppeteer")).default;
  return (await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })) as unknown as PdfBrowser;
}

async function renderHtmlToPdfWithBrowser(browser: PdfBrowser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchPdfBrowser();
  try {
    return await renderHtmlToPdfWithBrowser(browser, html);
  } finally {
    await browser.close();
  }
}

export type SignedChildAttachmentPdf = {
  childName: string;
  attachment1Html?: string | null;
  attachment2Html?: string | null;
};

export async function buildSignedContractPdfFiles(params: {
  contentHtml: string;
  childAttachments: SignedChildAttachmentPdf[];
}): Promise<ContractPdfFile[]> {
  const contractNumber = extractContractNumber(params.contentHtml);
  const childName =
    params.childAttachments.map((c) => c.childName.trim()).filter(Boolean)[0] || "dziecko";
  const files: ContractPdfFile[] = [];
  const browser = await launchPdfBrowser();

  try {
    files.push({
      filename: buildUmowaPdfFilename(childName, contractNumber),
      content: await renderHtmlToPdfWithBrowser(browser, params.contentHtml),
    });

    for (const child of params.childAttachments) {
      if (child.attachment1Html) {
        files.push({
          filename: buildImageConsentPdfFilename(child.childName || "dziecko", contractNumber),
          content: await renderHtmlToPdfWithBrowser(browser, child.attachment1Html),
        });
      }
      if (child.attachment2Html) {
        files.push({
          filename: buildPickupConsentPdfFilename(child.childName || "dziecko", contractNumber),
          content: await renderHtmlToPdfWithBrowser(browser, child.attachment2Html),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return files;
}
