import { formatContractAmount } from "@/lib/contract-html";
import { paymentTypeShortLabel } from "@/lib/payment-labels";

export type SignedContractExportRow = {
  childName: string;
  locationName: string | null;
  groupName: string | null;
  imageConsent: boolean | null;
  paymentType: string | null;
  amount: string | null;
};

function consentLabel(value: boolean | null): string {
  if (value === true) return "Tak";
  if (value === false) return "Nie";
  return "";
}

function amountLabel(amount: string | null): string {
  const formatted = formatContractAmount(amount);
  return formatted || "";
}

/** Generuje .xlsx listy podpisanych umów (po stronie przeglądarki). */
export async function downloadSignedContractsXlsx(input: {
  rows: SignedContractExportRow[];
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const sheetRows = input.rows.map((row) => ({
    "Imię i nazwisko dziecka": row.childName,
    Lokalizacja: row.locationName?.trim() || "",
    Grupa: row.groupName?.trim() || "",
    "Zgoda na wykorzystanie wizerunku": consentLabel(row.imageConsent),
    "Sposób płatności": row.paymentType
      ? paymentTypeShortLabel(row.paymentType)
      : "",
    "Kwota na umowie": amountLabel(row.amount),
  }));

  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(wb, sheet, "Umowy podpisane");

  const meta = XLSX.utils.aoa_to_sheet([
    ["Umowy podpisane — Harry English"],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba wierszy", String(input.rows.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = input.fileName ?? `umowy-podpisane-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
