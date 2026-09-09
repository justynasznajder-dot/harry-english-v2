/** Eksport zestawień rozliczeń (ratalne / jednorazowe / za zajęcia) do .xlsx. */

export type BillingSummaryExportLine = {
  parentName: string;
  parentEmail: string;
  childName: string;
  amount: number;
  parentTotal: number;
  invoiceStatus: string;
};

export type LessonBillingExportRow = {
  childName: string;
  parentEmail: string;
  lessonUnitPrice: string | null;
  present: number;
  absent: number;
  lessonsCount: string;
  amount: string;
  status: string;
};

function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function writeWorkbook(
  sheetName: string,
  rows: Record<string, string>[],
  meta: string[][],
  fileName: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Info");
  XLSX.writeFile(wb, fileName);
}

export async function downloadInvoicePreviewXlsx(input: {
  kindLabel: string;
  periodMonth: string;
  lines: BillingSummaryExportLine[];
  fileName?: string;
}): Promise<void> {
  const sheetRows = input.lines.map((row) => ({
    Rodzic: row.parentName,
    Email: row.parentEmail,
    Dziecko: row.childName,
    Kwota: formatAmount(row.amount),
    "Suma rodzica": formatAmount(row.parentTotal),
    "Status faktury": row.invoiceStatus,
  }));
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName =
    input.fileName ??
    `zestawienie-${input.kindLabel.toLowerCase().replace(/\s+/g, "-")}-${input.periodMonth}-${stamp}.xlsx`;
  await writeWorkbook(input.kindLabel, sheetRows, [
    ["Zestawienie planowanych kwot — Harry English"],
    ["Rodzaj", input.kindLabel],
    ["Miesiąc", input.periodMonth],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba wierszy", String(input.lines.length)],
  ], fileName);
}

export async function downloadLessonBillingXlsx(input: {
  periodMonth: string;
  rows: LessonBillingExportRow[];
  fileName?: string;
}): Promise<void> {
  const sheetRows = input.rows.map((row) => ({
    Dziecko: row.childName,
    Rodzic: row.parentEmail,
    "Stawka / zajęcie": row.lessonUnitPrice ?? "",
    Obecności: String(row.present),
    Nieobecności: String(row.absent),
    "Liczba zajęć": row.lessonsCount,
    "Kwota (PLN)": row.amount,
    Status: row.status,
  }));
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName =
    input.fileName ?? `zestawienie-za-zajecia-${input.periodMonth}-${stamp}.xlsx`;
  await writeWorkbook("Za pojedyncze zajęcia", sheetRows, [
    ["Zestawienie za pojedyncze zajęcia — Harry English"],
    ["Miesiąc", input.periodMonth],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba wierszy", String(input.rows.length)],
  ], fileName);
}
