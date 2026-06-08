import { extractContractNumber } from "@/lib/contract-html";

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

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdf);
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

  files.push({
    filename: buildContractPdfFilename("Umowa", contractNumber),
    content: await renderHtmlToPdf(params.contentHtml),
  });

  for (const child of params.childAttachments) {
    const childSlug = safePdfSlug(child.childName);
    if (child.attachment1Html) {
      files.push({
        filename: buildContractPdfFilename(
          childSlug ? `Zalacznik-1-wizerunek-${childSlug}` : "Zalacznik-1-wizerunek",
          contractNumber
        ),
        content: await renderHtmlToPdf(child.attachment1Html),
      });
    }
    if (child.attachment2Html) {
      files.push({
        filename: buildContractPdfFilename(
          childSlug ? `Zalacznik-2-odbior-${childSlug}` : "Zalacznik-2-odbior-dziecka",
          contractNumber
        ),
        content: await renderHtmlToPdf(child.attachment2Html),
      });
    }
  }

  return files;
}
