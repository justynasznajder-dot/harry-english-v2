import { NextRequest, NextResponse } from "next/server";
import { getParentProfileByUserId, getUserById } from "@/lib/db";
import { fetchParentSignedContracts } from "@/lib/parent-portal";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { listSignedContractPdfsForParent } from "@/lib/r2-storage";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;

  try {
    const [user, profile, contracts] = await Promise.all([
      getUserById(parentId),
      getParentProfileByUserId(parentId),
      fetchParentSignedContracts(parentId, schoolId),
    ]);

    let pdfFiles: Array<{
      key: string;
      filename: string;
      size: number | null;
      lastModified: string | null;
    }> = [];

    if (user && profile?.pesel) {
      try {
        pdfFiles = await listSignedContractPdfsForParent({
          schoolId,
          parentFullName: `${user.first_name} ${user.last_name}`.trim(),
          parentPesel: profile.pesel,
        });
      } catch (r2Error) {
        console.warn("R2 list for parent documents failed:", r2Error);
      }
    }

    return NextResponse.json({
      contracts: contracts.map((c) => ({
        id: c.id,
        signedAt: c.signedAt,
        status: c.status,
        paymentType: c.paymentType,
        schoolYearName: c.schoolYearName,
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
