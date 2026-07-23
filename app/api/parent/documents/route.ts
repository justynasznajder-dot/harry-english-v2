import { NextRequest, NextResponse } from "next/server";
import { fetchParentSignedContracts } from "@/lib/parent-portal";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { listSignedContractPdfsForParent } from "@/lib/r2-storage";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;

  try {
    const contracts = await fetchParentSignedContracts(parentId, schoolId);

    let pdfFiles: Array<{
      key: string;
      filename: string;
      size: number | null;
      lastModified: string | null;
    }> = [];

    try {
      pdfFiles = await listSignedContractPdfsForParent({
        parentUserId: parentId,
      });
    } catch (r2Error) {
      console.warn("R2 list for parent documents failed:", r2Error);
    }

    const schoolYearsMap = new Map<
      string,
      { id: string; name: string; active: boolean; dateFrom: string | null }
    >();
    for (const c of contracts) {
      if (!c.schoolYearId || !c.schoolYearName) continue;
      if (schoolYearsMap.has(c.schoolYearId)) continue;
      schoolYearsMap.set(c.schoolYearId, {
        id: c.schoolYearId,
        name: c.schoolYearName,
        active: c.schoolYearActive,
        dateFrom: c.schoolYearDateFrom,
      });
    }
    const schoolYears = Array.from(schoolYearsMap.values()).sort((a, b) =>
      String(b.dateFrom ?? "").localeCompare(String(a.dateFrom ?? ""), "pl")
    );

    return NextResponse.json({
      schoolYears,
      contracts: contracts.map((c) => ({
        id: c.id,
        signedAt: c.signedAt,
        status: c.status,
        paymentType: c.paymentType,
        schoolYearId: c.schoolYearId,
        schoolYearName: c.schoolYearName,
        schoolYearActive: c.schoolYearActive,
        contractNumber: c.contractNumber,
        children: c.children,
      })),
      pdfFiles: pdfFiles.map((f) => ({
        key: f.key,
        filename: f.filename,
        size: f.size,
        lastModified: f.lastModified,
        downloadUrl: `/api/parent/documents/download?key=${encodeURIComponent(f.key)}`,
      })),
    });
  } catch (error) {
    console.error("GET /api/parent/documents:", error);
    return NextResponse.json({ message: "Błąd pobierania dokumentów" }, { status: 500 });
  }
}
