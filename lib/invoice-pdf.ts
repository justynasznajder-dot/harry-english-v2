import { join } from "path";

import pdfMake from "pdfmake";
import type { Content, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";

import { formatContractAmount } from "@/lib/contract-html";
import type {
  InvoiceHtmlItemInput,
  InvoiceHtmlPlaceholders,
} from "@/lib/invoice-html";

export type InvoicePdfItem = {
  name: string;
  qty: string;
  discount: string;
  unitPrice: string;
  value: string;
};

export type InvoicePdfModel = {
  documentTitle: string;
  correctionLines: string[];
  invoiceNumber: string;
  issueDate: string;
  saleDate: string;
  issuePlace: string;
  sellerName: string;
  sellerAddress: string;
  sellerNip: string;
  buyerName: string;
  buyerAddress: string;
  buyerNipLine: string;
  items: InvoicePdfItem[];
  totalAmount: string;
  totalInWords: string;
  paymentMethod: string;
  dueDate: string;
  bankLabel: string;
  bankAccount: string;
  vatExemption: string;
  issuerName: string;
};

const BORDER = "#333333";
const MUTED = "#333333";

let fontsReady = false;

function fontsDir(): string {
  return join(process.cwd(), "assets", "fonts");
}

function ensureFonts(): void {
  if (fontsReady) return;
  const dir = fontsDir();
  const regular = join(dir, "Roboto-Regular.ttf");
  const bold = join(dir, "Roboto-Bold.ttf");
  pdfMake.setFonts({
    Roboto: {
      normal: regular,
      bold,
      italics: regular,
      bolditalics: bold,
    },
  });
  pdfMake.setUrlAccessPolicy(() => false);
  // pdfmake 0.3 wymaga ścieżek do plików fontów + jawnej zgody na odczyt lokalny
  pdfMake.setLocalAccessPolicy((filePath) => {
    const normalized = String(filePath ?? "").replace(/\\/g, "/").toLowerCase();
    return (
      normalized.includes("/assets/fonts/") &&
      (normalized.endsWith("roboto-regular.ttf") || normalized.endsWith("roboto-bold.ttf"))
    );
  });
  fontsReady = true;
}

function plainCorrectionLines(correctionNoteHtml: string): string[] {
  const raw = String(correctionNoteHtml ?? "").trim();
  if (!raw) return [];
  return raw
    .replace(/<\/div>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function boxCell(content: Content[], options?: { marginRight?: number }): Content {
  return {
    margin: [0, 0, options?.marginRight ?? 0, 0],
    table: {
      widths: ["*"],
      body: [[{ stack: content, margin: [8, 8, 8, 8] }]],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
    },
  };
}

function buildDocDefinition(model: InvoicePdfModel): TDocumentDefinitions {
  const itemRows: TableCell[][] = model.items.map((item, index) => [
    { text: String(index + 1), alignment: "center", margin: [2, 3, 2, 3] },
    { text: item.name || "—", margin: [4, 3, 4, 3] },
    { text: item.qty, alignment: "right", margin: [4, 3, 4, 3] },
    { text: item.discount, alignment: "right", margin: [4, 3, 4, 3] },
    { text: item.unitPrice, alignment: "right", margin: [4, 3, 4, 3] },
    { text: item.value, alignment: "right", margin: [4, 3, 4, 3] },
  ]);

  const content: Content[] = [
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 220,
          table: {
            widths: ["55%", "45%"],
            body: [
              [
                { text: "Miejsce wystawienia", color: MUTED, margin: [4, 3, 4, 3] },
                { text: model.issuePlace, bold: true, margin: [4, 3, 4, 3] },
              ],
              [
                { text: "Data sprzedaży", color: MUTED, margin: [4, 3, 4, 3] },
                { text: model.saleDate, bold: true, margin: [4, 3, 4, 3] },
              ],
              [
                { text: "Data wystawienia", color: MUTED, margin: [4, 3, 4, 3] },
                { text: model.issueDate, bold: true, margin: [4, 3, 4, 3] },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => BORDER,
            vLineColor: () => BORDER,
          },
        },
      ],
      margin: [0, 0, 0, 12],
    },
    {
      columns: [
        boxCell(
          [
            { text: "Sprzedawca", bold: true, margin: [0, 0, 0, 6] },
            { text: model.sellerName },
            { text: model.sellerAddress },
            { text: `NIP: ${model.sellerNip}`, margin: [0, 4, 0, 0] },
          ],
          { marginRight: 8 }
        ),
        boxCell([
          { text: "Nabywca", bold: true, margin: [0, 0, 0, 6] },
          { text: model.buyerName },
          { text: model.buyerAddress },
          ...(model.buyerNipLine
            ? [{ text: model.buyerNipLine, margin: [0, 4, 0, 0] as [number, number, number, number] }]
            : [{ text: " ", margin: [0, 4, 0, 0] as [number, number, number, number] }]),
        ]),
      ],
      margin: [0, 0, 0, 14],
    },
    {
      text: `${model.documentTitle} ${model.invoiceNumber}`,
      alignment: "center",
      bold: true,
      fontSize: 16,
      margin: [0, 4, 0, 12],
    },
  ];

  if (model.correctionLines.length > 0) {
    content.push({
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: model.correctionLines.map((line) => ({ text: line })),
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
      },
      margin: [0, 0, 0, 12],
    });
  }

  content.push(
    {
      table: {
        headerRows: 1,
        widths: [28, "*", 50, 45, 60, 60],
        body: [
          [
            { text: "Lp.", style: "th", alignment: "center" },
            { text: "Nazwa", style: "th", alignment: "center" },
            { text: "Ilość", style: "th", alignment: "center" },
            { text: "Rabat", style: "th", alignment: "center" },
            { text: "Cena (R)", style: "th", alignment: "center" },
            { text: "Wartość (R)", style: "th", alignment: "center" },
          ],
          ...itemRows,
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
        fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f3f3f3" : null),
      },
      margin: [0, 0, 0, 10],
    },
    {
      table: {
        widths: ["28%", "22%", "28%", "*"],
        body: [
          [
            { text: "Razem do zapłaty", bold: true, margin: [6, 5, 6, 5] },
            {
              text: `${model.totalAmount} PLN`,
              bold: true,
              alignment: "right",
              margin: [6, 5, 6, 5],
            },
            { text: "Słownie do zapłaty", margin: [6, 5, 6, 5] },
            { text: model.totalInWords, bold: true, margin: [6, 5, 6, 5] },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
      },
      margin: [0, 0, 0, 10],
    },
    {
      table: {
        widths: ["25%", "25%", "20%", "*"],
        body: [
          [
            { text: model.paymentMethod, margin: [6, 5, 6, 5] },
            { text: `do dnia ${model.dueDate}`, margin: [6, 5, 6, 5] },
            { text: "Na rachunek", margin: [6, 5, 6, 5] },
            {
              stack: [{ text: model.bankLabel }, { text: model.bankAccount }],
              margin: [6, 5, 6, 5],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
      },
      margin: [0, 0, 0, 12],
    },
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "Podstawa zwolnienia z podatku VAT", bold: true, margin: [0, 0, 0, 4] },
                { text: model.vatExemption },
              ],
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
      },
      margin: [0, 0, 0, 24],
    },
    {
      columns: [
        boxCell(
          [
            { text: "Wystawił(a)", alignment: "center" },
            {
              text: model.issuerName || " ",
              bold: true,
              alignment: "center",
              margin: [0, 10, 0, 14],
            },
            {
              text: "Podpis osoby upoważnionej do wystawienia dokumentu",
              fontSize: 8,
              color: MUTED,
              alignment: "center",
            },
          ],
          { marginRight: 12 }
        ),
        boxCell([
          { text: "Odebrał(a)", alignment: "center" },
          { text: " ", bold: true, alignment: "center", margin: [0, 10, 0, 14] },
          {
            text: "Podpis osoby upoważnionej do odbioru dokumentu",
            fontSize: 8,
            color: MUTED,
            alignment: "center",
          },
        ]),
      ],
    }
  );

  return {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    defaultStyle: {
      font: "Roboto",
      fontSize: 9,
      color: "#111111",
    },
    styles: {
      th: { bold: true, margin: [2, 4, 2, 4] },
    },
    content,
  };
}

/** Mapuje placeholdery HTML + pozycje na model PDF (bez dublowania formatowania dat/kwot). */
export function invoicePdfModelFromPlaceholders(
  placeholders: InvoiceHtmlPlaceholders,
  items: InvoiceHtmlItemInput[]
): InvoicePdfModel {
  const rows =
    items.length > 0
      ? items
      : [
          {
            name: placeholders.item_name,
            qty: placeholders.item_qty,
            discount: placeholders.item_discount,
            unitPrice: placeholders.item_price,
            value: placeholders.item_value,
          },
        ];

  return {
    documentTitle: placeholders.document_title,
    correctionLines: plainCorrectionLines(placeholders.correction_note),
    invoiceNumber: placeholders.invoice_number,
    issueDate: placeholders.issue_date,
    saleDate: placeholders.sale_date,
    issuePlace: placeholders.issue_place,
    sellerName: placeholders.seller_name,
    sellerAddress: placeholders.seller_address,
    sellerNip: placeholders.seller_nip,
    buyerName: placeholders.buyer_name,
    buyerAddress: placeholders.buyer_address,
    buyerNipLine: placeholders.buyer_nip_line,
    items: rows.map((item) => ({
      name: String(item.name ?? "").trim() || "—",
      qty: item.qty?.trim() || "1 szt",
      discount: item.discount?.trim() || "0 %",
      unitPrice:
        typeof item.unitPrice === "string" && item.unitPrice.includes(",")
          ? item.unitPrice
          : formatContractAmount(item.unitPrice),
      value:
        typeof item.value === "string" && String(item.value).includes(",")
          ? String(item.value)
          : formatContractAmount(item.value),
    })),
    totalAmount: placeholders.total_amount,
    totalInWords: placeholders.total_in_words,
    paymentMethod: placeholders.payment_method,
    dueDate: placeholders.due_date,
    bankLabel: placeholders.bank_label,
    bankAccount: placeholders.bank_account,
    vatExemption: placeholders.vat_exemption,
    issuerName: placeholders.issuer_name,
  };
}

/** Generuje Buffer PDF faktury (pdfmake, bez Chromium/Puppeteera). */
export async function buildInvoicePdf(model: InvoicePdfModel): Promise<Buffer> {
  ensureFonts();
  const doc = pdfMake.createPdf(buildDocDefinition(model));
  const buffer = await doc.getBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
