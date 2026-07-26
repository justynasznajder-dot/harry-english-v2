import { extractContractNumber } from "@/lib/contract-html";
import { buildPickupConsentPdfFilename } from "@/lib/pickup-consent-notice";

export type ContractPdfFile = {
  filename: string;
  content: Buffer;
};

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
  const files: ContractPdfFile[] = [];
  const browser = await launchPdfBrowser();

  try {
    files.push({
      filename: buildContractPdfFilename("Umowa", contractNumber),
      content: await renderHtmlToPdfWithBrowser(browser, params.contentHtml),
    });

    for (const child of params.childAttachments) {
      const childSlug = safePdfSlug(child.childName);
      if (child.attachment1Html) {
        files.push({
          filename: buildContractPdfFilename(
            childSlug ? `Zalacznik-1-wizerunek-${childSlug}` : "Zalacznik-1-wizerunek",
            contractNumber
          ),
          content: await renderHtmlToPdfWithBrowser(browser, child.attachment1Html),
        });
      }
      if (child.attachment2Html) {
        files.push({
          filename: buildPickupConsentPdfFilename(child.childName || "dziecko"),
          content: await renderHtmlToPdfWithBrowser(browser, child.attachment2Html),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return files;
}
