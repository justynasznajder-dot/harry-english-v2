import { formatContractAmount } from "@/lib/contract-html";

/** Zamienia zmienne {{key}} w szablonie HTML faktury. */
export function generateInvoiceHtml(
  templateHtml: string,
  placeholders: Record<string, string>
): string {
  let html = templateHtml;
  for (const [key, value] of Object.entries(placeholders)) {
    html = html.split(`{{${key}}}`).join(value ?? "");
  }
  return html;
}

export function formatInvoiceDatePl(date: Date | string): string {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [year, month, day] = date.slice(0, 10).split("-");
    return `${day}-${month}-${year}`;
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

const ONES = [
  "",
  "jeden",
  "dwa",
  "trzy",
  "cztery",
  "pięć",
  "sześć",
  "siedem",
  "osiem",
  "dziewięć",
];
const TEENS = [
  "dziesięć",
  "jedenaście",
  "dwanaście",
  "trzynaście",
  "czternaście",
  "piętnaście",
  "szesnaście",
  "siedemnaście",
  "osiemnaście",
  "dziewiętnaście",
];
const TENS = [
  "",
  "",
  "dwadzieścia",
  "trzydzieści",
  "czterdzieści",
  "pięćdziesiąt",
  "sześćdziesiąt",
  "siedemdziesiąt",
  "osiemdziesiąt",
  "dziewięćdziesiąt",
];
const HUNDREDS = [
  "",
  "sto",
  "dwieście",
  "trzysta",
  "czterysta",
  "pięćset",
  "sześćset",
  "siedemset",
  "osiemset",
  "dziewięćset",
];

function underThousand(n: number): string {
  if (n <= 0) return "";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]!);
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]!);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]!);
    if (o > 0) parts.push(ONES[o]!);
  }
  return parts.join(" ");
}

function pluralForm(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs === 1) return one;
  if (last >= 2 && last <= 4 && !(abs >= 12 && abs <= 14)) return few;
  return many;
}

/** Kwota słownie po polsku, np. „sto sześćdziesiąt PLN” / „sto sześćdziesiąt 50/100 PLN”. */
export function amountInWordsPln(amount: string | number): string {
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n)) return "";

  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const grosze = Math.round((abs - whole) * 100);

  const groups: Array<{ value: number; forms: [string, string, string] }> = [
    { value: Math.floor(whole / 1_000_000), forms: ["milion", "miliony", "milionów"] },
    { value: Math.floor((whole % 1_000_000) / 1_000), forms: ["tysiąc", "tysiące", "tysięcy"] },
    { value: whole % 1_000, forms: ["", "", ""] },
  ];

  const words: string[] = [];
  if (whole === 0) {
    words.push("zero");
  } else {
    for (const group of groups) {
      if (group.value <= 0) continue;
      const chunk = underThousand(group.value);
      if (!chunk) continue;
      if (group.forms[0]) {
        words.push(`${chunk} ${pluralForm(group.value, ...group.forms)}`);
      } else {
        words.push(chunk);
      }
    }
  }

  let result = words.join(" ");
  if (grosze > 0) {
    result += ` ${String(grosze).padStart(2, "0")}/100`;
  }
  result += " PLN";
  return negative ? `minus ${result}` : result;
}

export type InvoiceHtmlPlaceholders = {
  document_title: string;
  correction_note: string;
  invoice_number: string;
  issue_date: string;
  sale_date: string;
  issue_place: string;
  seller_name: string;
  seller_address: string;
  seller_nip: string;
  buyer_name: string;
  buyer_address: string;
  buyer_nip_line: string;
  item_lp: string;
  item_name: string;
  item_qty: string;
  item_discount: string;
  item_price: string;
  item_value: string;
  total_amount: string;
  total_in_words: string;
  payment_method: string;
  due_date: string;
  bank_label: string;
  bank_account: string;
  vat_exemption: string;
  issuer_name: string;
};

export const INVOICE_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>{{document_title}} {{invoice_number}}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #111;
      margin: 0;
      padding: 0;
    }
    .meta {
      float: right;
      width: 220px;
      border: 1px solid #333;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .meta td {
      border: 1px solid #333;
      padding: 4px 8px;
      vertical-align: top;
    }
    .meta td.label { width: 55%; color: #333; }
    .meta td.value { font-weight: 600; }
    .parties {
      clear: both;
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 20px;
    }
    .parties td {
      width: 50%;
      vertical-align: top;
      padding: 0 12px 0 0;
    }
    .parties .box {
      border: 1px solid #333;
      min-height: 90px;
      padding: 8px 10px;
    }
    .parties .heading {
      font-weight: 700;
      margin-bottom: 6px;
    }
    .title {
      clear: both;
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      margin: 18px 0 14px;
    }
    .items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .items th, .items td {
      border: 1px solid #333;
      padding: 5px 6px;
    }
    .items th {
      background: #f3f3f3;
      font-weight: 700;
      text-align: center;
    }
    .items td.num { text-align: center; width: 36px; }
    .items td.qty, .items td.disc, .items td.money { text-align: right; white-space: nowrap; }
    .summary {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .summary td {
      border: 1px solid #333;
      padding: 6px 8px;
      vertical-align: top;
    }
    .summary .total-label { font-weight: 700; width: 28%; }
    .summary .total-value { font-weight: 700; text-align: right; width: 22%; }
    .summary .words-label { width: 28%; }
    .summary .words-value { font-weight: 600; }
    .pay {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .pay td {
      border: 1px solid #333;
      padding: 6px 8px;
      vertical-align: top;
    }
    .vat {
      border: 1px solid #333;
      padding: 8px 10px;
      margin-bottom: 28px;
    }
    .vat .heading { font-weight: 700; margin-bottom: 4px; }
    .signs {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .signs td {
      width: 50%;
      vertical-align: top;
      padding: 0 16px 0 0;
    }
    .signs .box {
      border: 1px solid #333;
      min-height: 70px;
      padding: 8px 10px;
      text-align: center;
    }
    .signs .name { font-weight: 600; margin: 10px 0 18px; min-height: 16px; }
    .signs .caption { font-size: 10px; color: #333; }
    .nip-line { margin-top: 4px; }
  </style>
</head>
<body>
  <table class="meta">
    <tr><td class="label">Miejsce wystawienia</td><td class="value">{{issue_place}}</td></tr>
    <tr><td class="label">Data sprzedaży</td><td class="value">{{sale_date}}</td></tr>
    <tr><td class="label">Data wystawienia</td><td class="value">{{issue_date}}</td></tr>
  </table>

  <table class="parties">
    <tr>
      <td>
        <div class="box">
          <div class="heading">Sprzedawca</div>
          <div>{{seller_name}}</div>
          <div>{{seller_address}}</div>
          <div class="nip-line">NIP: {{seller_nip}}</div>
        </div>
      </td>
      <td>
        <div class="box">
          <div class="heading">Nabywca</div>
          <div>{{buyer_name}}</div>
          <div>{{buyer_address}}</div>
          <div class="nip-line">{{buyer_nip_line}}</div>
        </div>
      </td>
    </tr>
  </table>

  <div class="title">{{document_title}} {{invoice_number}}</div>
  {{correction_note}}

  <table class="items">
    <thead>
      <tr>
        <th>Lp.</th>
        <th>Nazwa</th>
        <th>Ilość</th>
        <th>Rabat</th>
        <th>Cena (R)</th>
        <th>Wartość (R)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">{{item_lp}}</td>
        <td>{{item_name}}</td>
        <td class="qty">{{item_qty}}</td>
        <td class="disc">{{item_discount}}</td>
        <td class="money">{{item_price}}</td>
        <td class="money">{{item_value}}</td>
      </tr>
    </tbody>
  </table>

  <table class="summary">
    <tr>
      <td class="total-label">Razem do zapłaty</td>
      <td class="total-value">{{total_amount}} PLN</td>
      <td class="words-label">Słownie do zapłaty</td>
      <td class="words-value">{{total_in_words}}</td>
    </tr>
  </table>

  <table class="pay">
    <tr>
      <td style="width:25%">{{payment_method}}</td>
      <td style="width:25%">do dnia {{due_date}}</td>
      <td style="width:20%">Na rachunek</td>
      <td>
        <div>{{bank_label}}</div>
        <div>{{bank_account}}</div>
      </td>
    </tr>
  </table>

  <div class="vat">
    <div class="heading">Podstawa zwolnienia z podatku VAT</div>
    <div>{{vat_exemption}}</div>
  </div>

  <table class="signs">
    <tr>
      <td>
        <div class="box">
          <div>Wystawił(a)</div>
          <div class="name">{{issuer_name}}</div>
          <div class="caption">Podpis osoby upoważnionej do wystawienia dokumentu</div>
        </div>
      </td>
      <td>
        <div class="box">
          <div>Odebrał(a)</div>
          <div class="name">&nbsp;</div>
          <div class="caption">Podpis osoby upoważnionej do odbioru dokumentu</div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

export function buildInvoicePlaceholders(params: {
  invoiceNumber: string;
  issueDate: Date;
  saleDate: Date;
  dueDate: Date | string;
  issuePlace: string;
  sellerName: string;
  sellerAddress: string;
  sellerNip: string;
  buyerName: string;
  buyerAddress: string;
  buyerNip: string | null;
  itemName: string;
  amount: string | number;
  bankLabel: string;
  bankAccount: string;
  vatExemption: string;
  issuerName: string;
  itemQty?: string;
  itemDiscount?: string;
  itemUnitPrice?: string | number;
  itemValue?: string | number;
  documentTitle?: string;
  originalInvoiceNumber?: string | null;
  correctionReason?: string | null;
}): InvoiceHtmlPlaceholders {
  const amountLabel = formatContractAmount(params.amount);
  const unitPriceLabel = formatContractAmount(params.itemUnitPrice ?? params.amount);
  const itemValueLabel = formatContractAmount(params.itemValue ?? params.amount);
  const buyerNip = String(params.buyerNip ?? "").trim();
  const isCorrective = Boolean(params.originalInvoiceNumber || params.correctionReason);
  const documentTitle = params.documentTitle?.trim() || (isCorrective ? "Faktura korygująca" : "Faktura");
  const correctionParts: string[] = [];
  if (params.originalInvoiceNumber) {
    correctionParts.push(`Dotyczy faktury: ${params.originalInvoiceNumber}`);
  }
  if (params.correctionReason?.trim()) {
    correctionParts.push(`Powód korekty: ${params.correctionReason.trim()}`);
  }
  const correction_note = correctionParts.length
    ? `<div style="margin:0 0 14px;padding:8px 10px;border:1px solid #333;">${correctionParts
        .map((p) => `<div>${p}</div>`)
        .join("")}</div>`
    : "";
  return {
    document_title: documentTitle,
    correction_note,
    invoice_number: params.invoiceNumber,
    issue_date: formatInvoiceDatePl(params.issueDate),
    sale_date: formatInvoiceDatePl(params.saleDate),
    issue_place: params.issuePlace,
    seller_name: params.sellerName,
    seller_address: params.sellerAddress,
    seller_nip: params.sellerNip,
    buyer_name: params.buyerName,
    buyer_address: params.buyerAddress,
    buyer_nip_line: buyerNip ? `NIP: ${buyerNip}` : "",
    item_lp: "1",
    item_name: params.itemName,
    item_qty: params.itemQty?.trim() || "1 szt",
    item_discount: params.itemDiscount?.trim() || "0 %",
    item_price: unitPriceLabel,
    item_value: itemValueLabel,
    total_amount: amountLabel,
    total_in_words: amountInWordsPln(params.amount),
    payment_method: "Przelew",
    due_date: formatInvoiceDatePl(params.dueDate),
    bank_label: params.bankLabel,
    bank_account: params.bankAccount,
    vat_exemption: params.vatExemption,
    issuer_name: params.issuerName,
  };
}

export function renderInvoiceHtml(placeholders: InvoiceHtmlPlaceholders): string {
  return generateInvoiceHtml(INVOICE_HTML_TEMPLATE, placeholders);
}
