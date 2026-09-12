import {
  buildContractAmountsVerification,
  formatVerificationMoney,
} from "@/lib/contract-amounts-verification";
import { paymentTypeShortLabel } from "@/lib/payment-labels";

export type ContractAmountsExportRow = {
  childFirstName: string;
  childLastName: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  statusLabel: string;
  groupName: string;
  hasProposedGroup: boolean;
  complimentary: boolean;
  hasKdr: boolean;
  hasSibling: boolean;
  managerDiscountPercent?: string | number | null;
  groupLessonsPerWeek?: number | null;
  studentLessonsPerWeek?: number | null;
  yearlyUnitPrice?: string | number | null;
  monthlyUnitPrice?: string | number | null;
  lessonUnitPrice?: string | number | null;
  contractPaymentType?: string | null;
  contractAmount?: string | number | null;
  contractBillingExempt?: boolean | null;
  contractHasKdr?: boolean | null;
  contractHasSibling?: boolean | null;
  contractLessonUnitPrice?: string | number | null;
  contractMonthlyUnitPrice?: string | number | null;
  contractYearlyUnitPrice?: string | number | null;
};

function moneyOrEmpty(value: number | null | undefined): number | "" {
  if (value == null || !Number.isFinite(value)) return "";
  return value;
}

/** Eksport widoku „Kwota na umowie + frekwencja”. */
export async function downloadContractAmountsXlsx(input: {
  rows: ContractAmountsExportRow[];
  discountSettings: { LARGE_FAMILY_CARD: number; SIBLING: number };
  filterLabel?: string;
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");

  const flat = input.rows.map((row) => {
    const v = buildContractAmountsVerification({
      yearlyUnitPrice: row.yearlyUnitPrice,
      monthlyUnitPrice: row.monthlyUnitPrice,
      lessonUnitPrice: row.lessonUnitPrice,
      hasProposedGroup: row.hasProposedGroup,
      groupLessonsPerWeek: row.groupLessonsPerWeek,
      studentLessonsPerWeek: row.studentLessonsPerWeek,
      managerDiscountPercent: row.managerDiscountPercent,
      hasKdr: row.hasKdr,
      hasSibling: row.hasSibling,
      complimentary: row.complimentary,
      discountSettings: input.discountSettings,
      contractYearlyUnitPrice: row.contractYearlyUnitPrice,
      contractMonthlyUnitPrice: row.contractMonthlyUnitPrice,
      contractLessonUnitPrice: row.contractLessonUnitPrice,
      contractPaymentType: row.contractPaymentType,
      contractAmount: row.contractAmount,
      contractBillingExempt: row.contractBillingExempt === true,
      contractHasKdr: row.contractHasKdr === true,
      contractHasSibling: row.contractHasSibling === true,
    });

    const chosen =
      v.paymentType != null ? paymentTypeShortLabel(v.paymentType) : "";
    const noFee = row.complimentary || row.contractBillingExempt === true;

    return {
      Uczeń: `${row.childFirstName} ${row.childLastName}`.trim(),
      Rodzic: `${row.parentFirstName} ${row.parentLastName}`.trim(),
      Email: row.parentEmail,
      Status: row.statusLabel,
      Grupa: row.groupName,
      "Tryb bez umowy": row.complimentary ? "Tak" : "Nie",
      "Bez opłat": noFee ? "Tak" : "Nie",
      Frekwencja: v.lessonsPerWeekLabel,
      "Frekwencja (×)": v.lessonsPerWeek ?? "",
      KDR: row.hasKdr ? "Tak" : "Nie",
      Rodzeństwo: row.hasSibling ? "Tak" : "Nie",
      "Rabat manager (%)":
        v.discount.managerPercent > 0 ? v.discount.managerPercent : "",
      "Rabat efektywny (%)": v.discount.percent > 0 ? v.discount.percent : "",
      "Rabat (opis)": v.discountLabel ?? "",
      "Jednorazowa (wyliczenie)": moneyOrEmpty(v.preview.yearly),
      "Ratalna (wyliczenie)": moneyOrEmpty(v.preview.monthly),
      "Za zajęcia (wyliczenie)": moneyOrEmpty(v.preview.lesson),
      "Jednorazowa (na umowie)": moneyOrEmpty(v.onContract?.yearly ?? null),
      "Ratalna (na umowie)": moneyOrEmpty(v.onContract?.monthly ?? null),
      "Za zajęcia (na umowie)": moneyOrEmpty(v.onContract?.lesson ?? null),
      "Wybrana płatność": noFee ? "bez opłat" : chosen,
      "Kwota na umowie / fakturze": moneyOrEmpty(noFee ? 0 : v.invoiceAmount),
      "Źródło kwoty": noFee
        ? "bez opłat"
        : v.invoiceAmountSource === "none"
          ? ""
          : v.invoiceAmountSource,
    };
  });

  const empty = {
    Uczeń: "",
    Rodzic: "",
    Email: "",
    Status: "",
    Grupa: "",
    "Tryb bez umowy": "",
    "Bez opłat": "",
    Frekwencja: "",
    "Frekwencja (×)": "",
    KDR: "",
    Rodzeństwo: "",
    "Rabat manager (%)": "",
    "Rabat efektywny (%)": "",
    "Rabat (opis)": "",
    "Jednorazowa (wyliczenie)": "",
    "Ratalna (wyliczenie)": "",
    "Za zajęcia (wyliczenie)": "",
    "Jednorazowa (na umowie)": "",
    "Ratalna (na umowie)": "",
    "Za zajęcia (na umowie)": "",
    "Wybrana płatność": "",
    "Kwota na umowie / fakturze": "",
    "Źródło kwoty": "",
  };

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(flat.length > 0 ? flat : [empty]);
  XLSX.utils.book_append_sheet(wb, sheet, "Kwoty i frekwencja");

  const meta = XLSX.utils.aoa_to_sheet([
    ["Kwota na umowie + frekwencja — Harry English"],
    ["Filtr", input.filterLabel ?? "Wszystkie zgłoszone dzieci"],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba uczniów", String(flat.length)],
    [
      "Wyliczenie",
      "stawka × frekwencja (z grupy lub override managera) × (1 − rabat%). Bez grupy: frekwencja pusta, YEARLY/MONTHLY bez mnożnika. Za zajęcia bez × frekwencji.",
    ],
    [
      "Na umowie",
      "stawki z contract_children + ten sam rabat; kwota na fakturze = contracts.amount (lub stawka za zajęcia).",
    ],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName =
    input.fileName ?? `kwota-na-umowie-frekwencja-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/** @deprecated helper for tests / UI parity */
export { formatVerificationMoney };
