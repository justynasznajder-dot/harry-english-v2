import {
  ENROLLMENT_STATUS_LABELS,
  resolveEnrollmentListBadge,
  type EnrollmentStatus,
} from "@/lib/enrollment-status";

export type EnrollmentListExportChild = {
  firstName: string;
  lastName: string;
  status: EnrollmentStatus;
  birthDate?: string | null;
  preferredLocation?: string | null;
  proposedGroupId?: string | null;
  notes?: string | null;
};

export type EnrollmentListExportParent = {
  firstName: string;
  lastName: string;
  email: string;
  complimentary: boolean;
  children: EnrollmentListExportChild[];
};

/** Eksport widoku listy zgłoszeń (Wszystkie / filtry) — działa lokalnie i na Vercel. */
export async function downloadEnrollmentListXlsx(input: {
  rows: EnrollmentListExportParent[];
  groupNameById: Record<string, string>;
  filterLabel: string;
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");

  const flat = input.rows.flatMap((parent) =>
    parent.children.map((child) => {
      const badge = resolveEnrollmentListBadge(child);
      const groupId = (child.proposedGroupId ?? "").trim();
      return {
        Uczeń: `${child.firstName} ${child.lastName}`.trim(),
        Rodzic: `${parent.firstName} ${parent.lastName}`.trim(),
        Email: parent.email,
        "Tryb bez umowy": parent.complimentary ? "Tak" : "Nie",
        Status: badge.label,
        "Status (kod)":
          ENROLLMENT_STATUS_LABELS[child.status] ?? String(child.status),
        "Data urodzenia": child.birthDate ?? "",
        "Preferowana lokalizacja": child.preferredLocation ?? "",
        Grupa: groupId ? input.groupNameById[groupId] ?? groupId : "",
        Notatki: child.notes ?? "",
      };
    })
  );

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    flat.length > 0
      ? flat
      : [
          {
            Uczeń: "",
            Rodzic: "",
            Email: "",
            "Tryb bez umowy": "",
            Status: "",
            "Status (kod)": "",
            "Data urodzenia": "",
            "Preferowana lokalizacja": "",
            Grupa: "",
            Notatki: "",
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, sheet, "Zgłoszenia");

  const meta = XLSX.utils.aoa_to_sheet([
    ["Zgłoszenia — Harry English"],
    ["Filtr", input.filterLabel],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba uczniów", String(flat.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = input.fileName ?? `zgloszenia-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export type ReportedChildrenExportRow = {
  childFirstName: string;
  childLastName: string;
  birthDate?: string | null;
  birthYear: string;
  preferredLocation?: string | null;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  complimentary: boolean;
  hasKdr: boolean;
  hasSibling: boolean;
  managerDiscountPercent: number | null;
  statusLabel: string;
  groupName: string;
  groupAssignedCount: number | null;
};

/** Eksport widoku „Zgłoszone dzieci” (lokalizacja + rok urodzenia). */
export async function downloadReportedChildrenXlsx(input: {
  rows: ReportedChildrenExportRow[];
  filterLabel: string;
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");

  const flat = input.rows.map((row) => ({
    Uczeń: `${row.childFirstName} ${row.childLastName}`.trim(),
    "Rok urodzenia": row.birthYear || "",
    "Data urodzenia": row.birthDate ?? "",
    "Preferowana lokalizacja": row.preferredLocation ?? "",
    Rodzic: `${row.parentFirstName} ${row.parentLastName}`.trim(),
    Email: row.parentEmail,
    "Tryb bez umowy": row.complimentary ? "Tak" : "Nie",
    KDR: row.hasKdr ? "Tak" : "Nie",
    Rodzeństwo: row.hasSibling ? "Tak" : "Nie",
    "Rabat manager (%)":
      row.managerDiscountPercent != null ? String(row.managerDiscountPercent) : "",
    Status: row.statusLabel,
    Grupa: row.groupName,
    "Dzieci w grupie":
      row.groupAssignedCount != null ? String(row.groupAssignedCount) : "",
  }));

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    flat.length > 0
      ? flat
      : [
          {
            Uczeń: "",
            "Rok urodzenia": "",
            "Data urodzenia": "",
            "Preferowana lokalizacja": "",
            Rodzic: "",
            Email: "",
            "Tryb bez umowy": "",
            KDR: "",
            Rodzeństwo: "",
            "Rabat manager (%)": "",
            Status: "",
            Grupa: "",
            "Dzieci w grupie": "",
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, sheet, "Zgłoszone dzieci");

  const meta = XLSX.utils.aoa_to_sheet([
    ["Zgłoszone dzieci — Harry English"],
    ["Filtr", input.filterLabel],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba uczniów", String(flat.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = input.fileName ?? `zgloszone-dzieci-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
