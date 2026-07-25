/**
 * Generator pliku EDI++ (.epp) dla biura rachunkowego (Rachmistrz / Rewizor).
 * Format zgodny z przykładem Subiekt 1.12 (Windows-1250, cel=0).
 */

export type EppInvoiceInput = {
  invoiceNumber: string;
  documentType: "SALE" | "CORRECTIVE" | string;
  originalInvoiceNumber: string | null;
  issueDate: string; // YYYY-MM-DD
  saleDate: string;
  dueDate: string;
  buyerCode: string;
  buyerName: string;
  buyerAddress: string;
  buyerNip: string | null;
  buyerEmail: string | null;
  amount: number;
  /** Liczba pozycji na fakturze (domyślnie 1). */
  itemCount?: number;
  paymentStatus: string | null;
  issuePlace: string;
  sellerName: string;
  sellerAddress: string;
  sellerNip: string;
  issuerName: string;
};

export type EppBuildParams = {
  yearMonth: string; // YYYY-MM
  invoices: EppInvoiceInput[];
  generatedAt?: Date;
  programName?: string;
};

const CP1250_EXTRA: Record<string, number> = {
  Ą: 0xa5,
  ą: 0xb9,
  Ć: 0xc6,
  ć: 0xe6,
  Ę: 0xca,
  ę: 0xea,
  Ł: 0xa3,
  ł: 0xb3,
  Ń: 0xd1,
  ń: 0xf1,
  Ó: 0xd3,
  ó: 0xf3,
  Ś: 0x8c,
  ś: 0x9c,
  Ź: 0x8f,
  ź: 0x9f,
  Ż: 0xaf,
  ż: 0xbf,
  "€": 0x80,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "‰": 0x89,
  Š: 0x8a,
  š: 0x9a,
  "‹": 0x8b,
  "›": 0x9b,
  Ž: 0x8e,
  ž: 0x9e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
  "¤": 0xa4,
  "§": 0xa7,
  "©": 0xa9,
  "«": 0xab,
  "¬": 0xac,
  "®": 0xae,
  "°": 0xb0,
  "±": 0xb1,
  "µ": 0xb5,
  "¶": 0xb6,
  "·": 0xb7,
  "»": 0xbb,
};

/** Kodowanie Windows-1250 (polska strona kodowa wymagana przez EPP). */
export function encodeWindows1250(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      bytes.push(cp);
      continue;
    }
    const mapped = CP1250_EXTRA[ch];
    if (mapped != null) {
      bytes.push(mapped);
      continue;
    }
    // Pozostałe bajty Latin-1 / CP1250 w zakresie 0xA0–0xFF bez polskich liter
    if (cp <= 0xff) {
      bytes.push(cp);
      continue;
    }
    bytes.push(0x3f); // ?
  }
  return Buffer.from(bytes);
}

export function formatEppDate(dateStr: string): string {
  const d = String(dateStr ?? "").slice(0, 10).replace(/-/g, "");
  if (!/^\d{8}$/.test(d)) {
    throw new Error(`Nieprawidłowa data EPP: ${dateStr}`);
  }
  return `${d}000000`;
}

export function formatEppDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}${h}${min}${s}`;
}

export function formatEppAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  if (Math.round(rounded * 100) % 100 === 0) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(2);
}

export function eppQuote(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function joinFields(fields: Array<string | number | null | undefined>): string {
  return fields
    .map((f) => {
      // null/undefined = puste pole bez cudzysłowów (np. brak daty)
      if (f == null) return "";
      if (typeof f === "number") return formatEppAmount(f);
      if (typeof f === "string" && f.startsWith('"')) return f;
      // surowe wartości numeryczne/logiczne bez cudzysłowów
      if (/^-?\d+(\.\d+)?$/.test(f)) return f;
      return eppQuote(f);
    })
    .join(",");
}

function normalizeStreet(street: string): string {
  // "Kingi, 14d" → "Kingi 14d"
  return String(street ?? "")
    .trim()
    .replace(/^(.+),\s+(\d+\w*(?:\/\d+\w*)?)$/u, "$1 $2");
}

export function parseAddressParts(full: string): {
  street: string;
  zip: string;
  city: string;
} {
  const raw = String(full ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return { street: "", zip: "", city: "" };

  const withZip = raw.match(/^(.*?),\s*(\d{2}-\d{3})\s+(.+)$/);
  if (withZip) {
    return {
      street: normalizeStreet(withZip[1]),
      zip: withZip[2],
      city: withZip[3].trim(),
    };
  }

  const zipFirst = raw.match(/^(\d{2}-\d{3})\s+(.+?),\s*(.+)$/);
  if (zipFirst) {
    return {
      zip: zipFirst[1],
      city: zipFirst[2].trim(),
      street: normalizeStreet(zipFirst[3]),
    };
  }

  const onlyZip = raw.match(/(\d{2}-\d{3})/);
  if (onlyZip) {
    const zip = onlyZip[1];
    const rest = raw.replace(zip, "").replace(/^,\s*|\s*,$/g, "").trim();
    const parts = rest.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        street: normalizeStreet(parts[0]),
        zip,
        city: parts.slice(1).join(", "),
      };
    }
    return { street: normalizeStreet(rest), zip, city: "" };
  }

  const comma = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (comma.length >= 2) {
    return {
      street: normalizeStreet(comma[0]),
      zip: "",
      city: comma.slice(1).join(", "),
    };
  }
  return { street: normalizeStreet(raw), zip: "", city: "" };
}

function docTypeCode(documentType: string): "FS" | "KFS" {
  return documentType === "CORRECTIVE" ? "KFS" : "FS";
}

/** Pełny numer dokumentu w EPP = numer z systemu (bez dopisywania FS/KFS). */
export function eppDocumentFullNumber(
  _documentType: string,
  invoiceNumber: string
): string {
  return String(invoiceNumber ?? "").trim().slice(0, 30);
}

function yearMonthBounds(yearMonth: string): {
  from: string;
  to: string;
  fromDate: string;
  toDate: string;
} {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error("Nieprawidłowy yearMonth (YYYY-MM)");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    fromDate,
    toDate,
    from: formatEppDate(fromDate),
    to: formatEppDate(toDate),
  };
}

function buildInfoLine(params: {
  sellerName: string;
  sellerAddress: string;
  sellerNip: string;
  issuePlace: string;
  issuerName: string;
  yearMonth: string;
  generatedAt: Date;
  programName: string;
}): string {
  const bounds = yearMonthBounds(params.yearMonth);
  const parsed = parseAddressParts(params.sellerAddress);
  const city = parsed.city || params.issuePlace || "";
  const zip = parsed.zip;
  const street = parsed.street || params.sellerAddress;
  const name = params.sellerName.slice(0, 80);

  return joinFields([
    eppQuote("1.12"),
    "0", // biuro rachunkowe
    "1250",
    eppQuote(params.programName.slice(0, 255)),
    eppQuote(params.programName.slice(0, 20)),
    eppQuote(name.slice(0, 40)),
    eppQuote(name),
    eppQuote(city.slice(0, 30)),
    eppQuote(zip.slice(0, 6)),
    eppQuote(street.slice(0, 50)),
    eppQuote(String(params.sellerNip ?? "").replace(/\s+/g, "").slice(0, 13)),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    "1",
    bounds.from,
    bounds.to,
    eppQuote((params.issuerName || name).slice(0, 35)),
    formatEppDateTime(params.generatedAt),
    eppQuote("Polska"),
    eppQuote("PL"),
    eppQuote(""),
    "0",
  ]);
}

function buildNaglowekLine(
  inv: EppInvoiceInput,
  seq: number
): string {
  const code = docTypeCode(inv.documentType);
  const fullNumber = eppDocumentFullNumber(inv.documentType, inv.invoiceNumber);
  const corrected =
    code === "KFS" && inv.originalInvoiceNumber
      ? eppDocumentFullNumber("SALE", inv.originalInvoiceNumber)
      : "";
  const addr = parseAddressParts(inv.buyerAddress);
  const city = (addr.city || inv.issuePlace || "").slice(0, 30);
  const zip = addr.zip.slice(0, 6);
  const street = addr.street.slice(0, 50);
  const amount = inv.amount;
  const paid = inv.paymentStatus === "PAID" ? amount : 0;
  const toPay = amount;
  const buyerCode = (inv.buyerCode || inv.buyerName.slice(0, 20)).slice(0, 20);
  const buyerName = inv.buyerName.slice(0, 255);
  const shortName = buyerName.slice(0, 40);
  const nip = String(inv.buyerNip ?? "").replace(/\s+/g, "").slice(0, 20);

  return joinFields([
    eppQuote(code), // 1 typ
    "1", // 2 status wykonany
    "0", // 3 fiskalny
    String(seq), // 4 numer
    eppQuote(""), // 5
    eppQuote(""), // 6
    eppQuote(fullNumber), // 7
    eppQuote(corrected), // 8
    eppQuote(""), // 9
    eppQuote(""), // 10
    eppQuote(""), // 11
    eppQuote(buyerCode), // 12
    eppQuote(shortName), // 13
    eppQuote(buyerName), // 14
    eppQuote(city), // 15
    eppQuote(zip), // 16
    eppQuote(street), // 17
    eppQuote(nip), // 18
    eppQuote(""), // 19 kategoria
    eppQuote(""), // 20
    eppQuote((inv.issuePlace || city).slice(0, 30)), // 21
    formatEppDate(inv.issueDate), // 22
    formatEppDate(inv.saleDate), // 23
    null, // 24 data otrzymania — puste bez cudzysłowów
    String(Math.max(1, Math.round(inv.itemCount ?? 1))), // 25 pozycje
    "0", // 26 netto?
    eppQuote("Detaliczny"), // 27
    amount, // 28 netto
    0, // 29 vat
    amount, // 30 brutto
    0, // 31 koszt
    eppQuote(""), // 32 rabat
    0, // 33
    eppQuote(""), // 34 forma płatności
    formatEppDate(inv.dueDate), // 35
    paid, // 36 zapłacono
    toPay, // 37 do zapłaty
    "0", // 38
    "0", // 39
    "1", // 40 auto VAT
    "0", // 41
    eppQuote((inv.issuerName || "").slice(0, 35)), // 42
    eppQuote(""), // 43
    eppQuote(""), // 44
    0, // 45
    0, // 46
    eppQuote("PLN"), // 47
    1, // 48 kurs
    eppQuote(""), // 49
    eppQuote(""), // 50
    eppQuote(""), // 51
    eppQuote(""), // 52
    "0", // 53 import
    "0", // 54 dokument eksportowy (sprzedaż krajowa)
    "0", // 55 transakcja krajowa
    eppQuote(""), // 56
    0, // 57
    eppQuote(""), // 58
    0, // 59
    eppQuote("Polska"), // 60
    eppQuote(""), // 61
    "0", // 62
  ]);
}

/** Tabela VAT zwolniona (zw) — 18 pól jak w eksporcie Subiekt 1.12. */
function buildZawartoscZw(amount: number): string {
  const a = formatEppAmount(amount);
  return [
    eppQuote("zw"),
    "0",
    a,
    "0",
    a,
    a,
    "0",
    a,
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ].join(",");
}

function buildKontrahentLine(inv: EppInvoiceInput): string {
  const addr = parseAddressParts(inv.buyerAddress);
  const code = (inv.buyerCode || inv.buyerName.slice(0, 20)).slice(0, 20);
  const name = inv.buyerName.slice(0, 80);
  const nip = String(inv.buyerNip ?? "").replace(/\s+/g, "").slice(0, 20);
  const typ = nip ? "2" : "4";
  return joinFields([
    typ,
    eppQuote(code),
    eppQuote(name.slice(0, 40)),
    eppQuote(name),
    eppQuote((addr.city || inv.issuePlace || "").slice(0, 30)),
    eppQuote(addr.zip.slice(0, 6)),
    eppQuote(addr.street.slice(0, 50)),
    eppQuote(nip),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote((inv.buyerEmail || "").slice(0, 50)),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote(""),
    eppQuote("Polska"),
    eppQuote(""),
    "0",
    eppQuote(""),
  ]);
}

function pushSection(lines: string[], nagKeyword: string, rows: string[]) {
  if (rows.length === 0) return;
  lines.push("[NAGLOWEK]");
  lines.push(eppQuote(nagKeyword));
  lines.push("");
  lines.push("[ZAWARTOSC]");
  for (const row of rows) {
    lines.push(row);
    lines.push("");
  }
}

/**
 * Buduje treść pliku .epp (UTF-16 JS string) — przed zapisem zakodować encodeWindows1250.
 */
export function buildEppDocumentText(params: EppBuildParams): string {
  const generatedAt = params.generatedAt ?? new Date();
  const programName = params.programName ?? "HarryEnglish";
  const invoices = [...params.invoices].sort((a, b) => {
    const d = a.issueDate.localeCompare(b.issueDate);
    if (d !== 0) return d;
    return a.invoiceNumber.localeCompare(b.invoiceNumber, "pl");
  });

  if (invoices.length === 0) {
    throw new Error("Brak faktur do eksportu EPP w wybranym miesiącu");
  }

  const first = invoices[0];
  const lines: string[] = [];
  lines.push("[INFO]");
  lines.push(
    buildInfoLine({
      sellerName: first.sellerName,
      sellerAddress: first.sellerAddress,
      sellerNip: first.sellerNip,
      issuePlace: first.issuePlace,
      issuerName: first.issuerName,
      yearMonth: params.yearMonth,
      generatedAt,
      programName,
    })
  );
  lines.push("");

  const fullNumbers: string[] = [];
  invoices.forEach((inv, idx) => {
    const fullNumber = eppDocumentFullNumber(inv.documentType, inv.invoiceNumber);
    fullNumbers.push(fullNumber);
    lines.push("[NAGLOWEK]");
    lines.push(buildNaglowekLine(inv, idx + 1));
    lines.push("");
    lines.push("[ZAWARTOSC]");
    lines.push(buildZawartoscZw(inv.amount));
    lines.push("");
  });

  pushSection(
    lines,
    "WYMAGALNOSCMPP",
    fullNumbers.map((n) => `${eppQuote(n)},0`)
  );

  const uniqueBuyers = new Map<string, EppInvoiceInput>();
  for (const inv of invoices) {
    const key = (inv.buyerCode || inv.buyerName).trim();
    if (!uniqueBuyers.has(key)) uniqueBuyers.set(key, inv);
  }
  const buyerList = [...uniqueBuyers.values()];

  pushSection(
    lines,
    "KONTRAHENCI",
    buyerList.map((inv) => buildKontrahentLine(inv))
  );

  pushSection(
    lines,
    "DODATKOWEKONTRAHENTOW",
    buyerList.map((inv) => {
      const code = (inv.buyerCode || inv.buyerName.slice(0, 20)).slice(0, 20);
      return `${eppQuote(code)},0,0,0,0`;
    })
  );

  pushSection(
    lines,
    "DATYZAKONCZENIA",
    invoices.map((inv, i) => `${eppQuote(fullNumbers[i])},${formatEppDate(inv.saleDate)}`)
  );

  const jpkZeros = Array.from({ length: 30 }, () => "0").join(",");
  pushSection(
    lines,
    "DOKUMENTYZNACZNIKIJPKVAT",
    fullNumbers.map((n) => `${eppQuote(n)},${jpkZeros}`)
  );

  // Pusta linia na końcu pliku (wymóg EDI++)
  if (lines[lines.length - 1] !== "") lines.push("");
  return lines.join("\r\n");
}

export function buildEppFileBuffer(params: EppBuildParams): Buffer {
  return encodeWindows1250(buildEppDocumentText(params));
}

export function eppFilename(yearMonth: string): string {
  const bounds = yearMonthBounds(yearMonth);
  return `dokumenty_${bounds.fromDate}_${bounds.toDate}.epp`;
}
