import type { StudentListPipelineStage } from "@/lib/enrollment-status";
import {
  resolveStudentListPipelineStage,
  STUDENT_LIST_PIPELINE_STAGES,
} from "@/lib/enrollment-status";

export type StudentPipelineExportRow = {
  childName: string;
  parentName: string;
  parentEmail: string;
  enrollmentStatus: string;
  proposalGroup: string | null;
  contractStatus: string | null;
  groupName: string | null;
};

const STAGE_ORDER: Record<StudentListPipelineStage, number> = {
  Zgłoszenie: 0,
  "Przypisany do grupy": 1,
  "Umowa wysłana": 2,
  "Umowa podpisana": 3,
};

function pipelineCells(
  row: StudentPipelineExportRow,
  complimentaryMode: boolean
): {
  group: string;
  contractSent: string;
  contractSigned: string;
  stage: string;
} {
  const groupLabel = row.groupName || row.proposalGroup;
  const current = resolveStudentListPipelineStage({
    enrollmentStatus: row.enrollmentStatus,
    hasGroup: Boolean(groupLabel),
    contractStatus: complimentaryMode ? null : row.contractStatus,
    complimentary: complimentaryMode,
  });

  const group =
    STAGE_ORDER[current] >= STAGE_ORDER["Przypisany do grupy"]
      ? groupLabel || "Tak"
      : "";

  const contractSent =
    !complimentaryMode &&
    (current === "Umowa wysłana" ||
      STAGE_ORDER[current] > STAGE_ORDER["Umowa wysłana"])
      ? row.contractStatus?.trim() || "Tak"
      : "";

  const contractSigned =
    !complimentaryMode && current === "Umowa podpisana" ? "Tak" : "";

  return { group, contractSent, contractSigned, stage: current };
}

function sheetRows(
  rows: StudentPipelineExportRow[],
  complimentaryMode: boolean
): Record<string, string>[] {
  return rows.map((row) => {
    const cells = pipelineCells(row, complimentaryMode);
    const base: Record<string, string> = {
      Uczeń: row.childName,
      Rodzic: row.parentName,
      Email: row.parentEmail,
      Zgłoszenie: "Tak",
      "Przypisany do grupy": cells.group,
      Etap: cells.stage,
    };
    if (!complimentaryMode) {
      base["Umowa wysłana"] = cells.contractSent;
      base["Umowa podpisana"] = cells.contractSigned;
    }
    return base;
  });
}

/** Generuje .xlsx listy uczniów (działa lokalnie i na Vercel — po stronie przeglądarki). */
export async function downloadStudentPipelineXlsx(input: {
  withContracts: StudentPipelineExportRow[];
  withoutContracts: StudentPipelineExportRow[];
  fileName?: string;
}): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const withSheet = XLSX.utils.json_to_sheet(
    sheetRows(input.withContracts, false)
  );
  XLSX.utils.book_append_sheet(wb, withSheet, "Z umowami");

  const withoutSheet = XLSX.utils.json_to_sheet(
    sheetRows(input.withoutContracts, true)
  );
  XLSX.utils.book_append_sheet(wb, withoutSheet, "Bez umów");

  const meta = XLSX.utils.aoa_to_sheet([
    ["Lista uczniów — Harry English"],
    ["Wygenerowano", new Date().toLocaleString("pl-PL")],
    ["Przepływ", STUDENT_LIST_PIPELINE_STAGES.join(" → ")],
    ["Z umowami", String(input.withContracts.length)],
    ["Bez umów (tryb bez opłat)", String(input.withoutContracts.length)],
    ["Razem", String(input.withContracts.length + input.withoutContracts.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = input.fileName ?? `lista-uczniow-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
