export type FamiliesExportChild = {
  clientNumber: string | null;
  firstName: string;
  lastName: string;
  birthDate: string;
  confirmed: boolean;
  groupName: string | null;
};

export type FamiliesExportParent = {
  clientNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  siblingDiscount: boolean;
  children: FamiliesExportChild[];
};

export type ChildrenListExportRow = {
  childClientNumber: string | null;
  childFirstName: string;
  childLastName: string;
  birthDate: string;
  confirmed: boolean;
  groupName: string | null;
  parentClientNumber: string | null;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
};

function compareClientNumber(a: string | null | undefined, b: string | null | undefined): number {
  const aId = a?.trim() ?? "";
  const bId = b?.trim() ?? "";
  if (!aId && !bId) return 0;
  if (!aId) return 1;
  if (!bId) return -1;
  return aId.localeCompare(bId, "pl", { numeric: true });
}

/** Eksport listy rodziców z dziećmi (po stronie przeglądarki). */
export async function downloadFamiliesXlsx(input: {
  parents: FamiliesExportParent[];
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");

  const parents = [...input.parents].sort((a, b) =>
    compareClientNumber(a.clientNumber, b.clientNumber),
  );

  const flat = parents.flatMap((parent) => {
    const parentBase = {
      "ID rodzica": parent.clientNumber?.trim() || "",
      Rodzic: `${parent.firstName} ${parent.lastName}`.trim(),
      Email: parent.email,
      "Status rodzica": parent.active ? "aktywny" : "nieaktywny",
      "Rabat rodzeństwa 5%": parent.siblingDiscount ? "Tak" : "Nie",
      "Liczba dzieci": parent.children.length,
    };

    const children = [...parent.children].sort((a, b) =>
      compareClientNumber(a.clientNumber, b.clientNumber),
    );

    if (children.length === 0) {
      return [
        {
          ...parentBase,
          "ID dziecka": "",
          "Imię dziecka": "",
          "Nazwisko dziecka": "",
          "Data urodzenia": "",
          "Status dziecka": "",
          Grupa: "",
        },
      ];
    }

    return children.map((child) => ({
      ...parentBase,
      "ID dziecka": child.clientNumber?.trim() || "",
      "Imię dziecka": child.firstName,
      "Nazwisko dziecka": child.lastName,
      "Data urodzenia": child.birthDate,
      "Status dziecka": child.confirmed ? "potwierdzony" : "niepotwierdzony",
      Grupa: child.groupName?.trim() || "",
    }));
  });

  const emptyRow = {
    "ID rodzica": "",
    Rodzic: "",
    Email: "",
    "Status rodzica": "",
    "Rabat rodzeństwa 5%": "",
    "Liczba dzieci": "",
    "ID dziecka": "",
    "Imię dziecka": "",
    "Nazwisko dziecka": "",
    "Data urodzenia": "",
    "Status dziecka": "",
    Grupa: "",
  };

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(flat.length > 0 ? flat : [emptyRow]);
  XLSX.utils.book_append_sheet(wb, sheet, "Rodzice i dzieci");

  const childrenCount = parents.reduce((sum, p) => sum + p.children.length, 0);
  const meta = XLSX.utils.aoa_to_sheet([
    ["Rodzice / dzieci — Harry English"],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba rodziców", String(parents.length)],
    ["Liczba dzieci", String(childrenCount)],
    ["Liczba wierszy", String(flat.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = input.fileName ?? `rodzice-dzieci-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/** Eksport listy dzieci z danymi rodzica (po stronie przeglądarki). */
export async function downloadChildrenListXlsx(input: {
  rows: ChildrenListExportRow[];
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = [...input.rows].sort((a, b) =>
    compareClientNumber(a.childClientNumber, b.childClientNumber),
  );

  const flat = rows.map((row) => ({
    "ID dziecka": row.childClientNumber?.trim() || "",
    Imię: row.childFirstName,
    Nazwisko: row.childLastName,
    "Data urodzenia": row.birthDate,
    Status: row.confirmed ? "potwierdzony" : "niepotwierdzony",
    Grupa: row.groupName?.trim() || "",
    "ID rodzica": row.parentClientNumber?.trim() || "",
    Rodzic: `${row.parentFirstName} ${row.parentLastName}`.trim(),
    "Email rodzica": row.parentEmail,
  }));

  const emptyRow = {
    "ID dziecka": "",
    Imię: "",
    Nazwisko: "",
    "Data urodzenia": "",
    Status: "",
    Grupa: "",
    "ID rodzica": "",
    Rodzic: "",
    "Email rodzica": "",
  };

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(flat.length > 0 ? flat : [emptyRow]);
  XLSX.utils.book_append_sheet(wb, sheet, "Dzieci");

  const meta = XLSX.utils.aoa_to_sheet([
    ["Lista dzieci — Harry English"],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Liczba dzieci", String(rows.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = input.fileName ?? `dzieci-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
