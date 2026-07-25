/**
 * Parser wyciągów ING Bank Śląski (CSV „Lista transakcji”).
 * Kolumny: Data transakcji, Data księgowania, Dane kontrahenta, Tytuł, Kwota…
 */

export type ParsedBankTransfer = {
  transactionDate: string; // YYYY-MM-DD
  bookingDate: string; // YYYY-MM-DD
  counterparty: string;
  title: string;
  amount: number;
  currency: string;
  bankTransactionId: string | null;
};

const HEADER_MARKERS = ["data transakcji", "data księgowania", "dane kontrahenta", "tytuł"];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** Prosty parser CSV z separatorem `;` i opcjonalnymi cudzysłowami. */
export function splitCsvLine(line: string, delimiter = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** ING: `26.07.2026` → `2026-07-26`; też ISO `2026-07-26`. */
export function parseIngDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function parseIngAmount(raw: string): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/"/g, "");
  if (!s) return null;
  // 1 234,56 lub 1234.56
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function stripIngQuotes(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/'+$/, "")
    .trim();
}

function findHeaderRow(lines: string[]): { index: number; cols: string[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((c) => normalizeHeader(c));
    const joined = cols.join("|");
    if (
      HEADER_MARKERS.every((m) =>
        cols.some((c) => c.includes(normalizeHeader(m)))
      ) ||
      (joined.includes("data transakcji") && joined.includes("tytul"))
    ) {
      return { index: i, cols };
    }
  }
  return null;
}

function colIndex(cols: string[], ...needles: string[]): number {
  for (const needle of needles) {
    const n = normalizeHeader(needle);
    const exact = cols.findIndex((c) => c === n);
    if (exact >= 0) return exact;
  }
  for (const needle of needles) {
    const n = normalizeHeader(needle);
    const starts = cols.findIndex((c) => c.startsWith(n));
    if (starts >= 0) return starts;
  }
  return -1;
}

/** Pierwsza kolumna „Waluta” stojąca zaraz po kwocie transakcji. */
function currencyColAfterAmount(cols: string[], amountIdx: number): number {
  for (let i = amountIdx + 1; i < cols.length; i++) {
    if (cols[i] === "waluta") return i;
  }
  return -1;
}

/**
 * Parsuje zawartość pliku CSV wyciągu ING.
 * Pomija wiersze bez daty / tytułu / kwoty oraz wiersze z kwotą ≤ 0 (obciążenia).
 */
export function parseIngBankStatementCsv(content: string): ParsedBankTransfer[] {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const header = findHeaderRow(lines);
  if (!header) {
    throw new Error("Nie znaleziono nagłówka kolumn wyciągu ING (Data transakcji / Tytuł).");
  }

  const iTx = colIndex(header.cols, "data transakcji", "data trans");
  const iBook = colIndex(header.cols, "data księgowania", "data ksiegowania", "data księg");
  const iParty = colIndex(header.cols, "dane kontrahenta", "dane kontr", "dane kont");
  const iTitle = colIndex(header.cols, "tytuł", "tytul");
  const iAmount = colIndex(
    header.cols,
    "kwota transakcji (waluta rachunku)",
    "kwota transakcji",
    "kwota tra"
  );
  const iCurrency = iAmount >= 0 ? currencyColAfterAmount(header.cols, iAmount) : -1;
  const iTxId = colIndex(header.cols, "nr transakcji", "nr transak");

  if (iTx < 0 || iTitle < 0 || iAmount < 0) {
    throw new Error("Brak wymaganych kolumn: Data transakcji, Tytuł lub Kwota transakcji.");
  }

  const transfers: ParsedBankTransfer[] = [];
  for (let li = header.index + 1; li < lines.length; li++) {
    const raw = lines[li];
    // Stop on footer / empty trailing noise
    if (/^dokument ma charakter/i.test(raw.trim())) break;
    const cells = splitCsvLine(raw);
    if (cells.every((c) => !String(c).trim())) continue;

    const transactionDate = parseIngDate(cells[iTx] ?? "");
    const bookingDate = parseIngDate(cells[iBook >= 0 ? iBook : iTx] ?? "") ?? transactionDate;
    const title = String(cells[iTitle] ?? "").trim();
    const amount = parseIngAmount(cells[iAmount] ?? "");
    if (!transactionDate || !bookingDate || !title || amount == null) continue;
    if (amount <= 0) continue; // tylko uznania

    const currencyRaw =
      iCurrency >= 0 ? String(cells[iCurrency] ?? "PLN").trim().toUpperCase() : "PLN";
    const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "PLN";
    const bankTransactionId =
      iTxId >= 0 ? stripIngQuotes(cells[iTxId] ?? "") || null : null;

    transfers.push({
      transactionDate,
      bookingDate,
      counterparty: String(cells[iParty >= 0 ? iParty : -1] ?? "").trim(),
      title,
      amount,
      currency,
      bankTransactionId,
    });
  }

  return transfers;
}

/** Czy tytuł zawiera numer faktury (dokładny fragment). */
export function titleContainsInvoiceNumber(title: string, invoiceNumber: string): boolean {
  const t = title.trim().toLowerCase();
  const n = invoiceNumber.trim().toLowerCase();
  if (!t || !n) return false;
  return t.includes(n);
}

/**
 * Czy tytuł zawiera nr klienta rodzica (5 cyfr).
 * Akceptuje m.in. „klient 00007”, „00007”, „00012/7/2026/1”.
 */
export function titleContainsClientNumber(title: string, clientNumber: string): boolean {
  const cn = clientNumber.trim();
  if (!/^\d{5}$/.test(cn)) return false;
  const t = title.trim();
  if (!t) return false;
  // Unikaj częściowego trafienia w dłuższy ciąg cyfr (np. numer rachunku)
  const re = new RegExp(`(?<!\\d)${cn}(?!\\d)`);
  return re.test(t);
}
