import { describe, expect, it } from "vitest";
import {
  buildClientDocumentR2Prefix,
  buildInvoiceR2Prefix,
  buildSignedContractR2Prefix,
  isParentDokumentyKeyAllowed,
  sanitizeSchoolYearFolderName,
} from "@/lib/r2-storage";

describe("R2 client document paths", () => {
  const parentUserId = "parent-uuid-1";
  const schoolId = "school-uuid-1";

  it("sanitizes school year name for folder segment", () => {
    expect(sanitizeSchoolYearFolderName("2025/2026")).toBe("2025-2026");
    expect(sanitizeSchoolYearFolderName(" 2025 / 2026 ")).toBe("2025-2026");
  });

  it("builds umowy as {schoolId}/{parentId}/{schoolYear}/umowy", () => {
    expect(
      buildSignedContractR2Prefix({
        schoolId,
        parentUserId,
        schoolYearName: "2025/2026",
      })
    ).toBe(`${schoolId}/${parentUserId}/2025-2026/umowy`);
  });

  it("keeps faktury on legacy {userId}/{year}/faktury", () => {
    expect(
      buildClientDocumentR2Prefix({
        parentUserId,
        year: 2026,
        kind: "faktury",
      })
    ).toBe(`${parentUserId}/2026/faktury`);
    expect(
      buildInvoiceR2Prefix({
        parentUserId,
        issuedAt: new Date("2026-09-15T12:00:00Z"),
      })
    ).toBe(`${parentUserId}/2026/faktury`);
  });

  it("akceptuje nowy klucz umowy i legacy", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `${schoolId}/${parentUserId}/2025-2026/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
        kind: "umowy",
      })
    ).toBe(true);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
        kind: "umowy",
      })
    ).toBe(true);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/faktury/Faktura.pdf`,
        parentUserId,
        schoolId,
        kind: "faktury",
      })
    ).toBe(true);
  });

  it("odrzuca klucz innego rodzica / szkoły lub złą ścieżkę", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `${schoolId}/other-parent/2025-2026/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `other-school/${parentUserId}/2025-2026/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/faktury/Faktura.pdf`,
        parentUserId,
        schoolId,
        kind: "umowy",
      })
    ).toBe(false);
  });
});
