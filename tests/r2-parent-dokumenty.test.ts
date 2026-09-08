import { describe, expect, it } from "vitest";
import {
  buildClientDocumentR2Prefix,
  buildInvoiceR2Prefix,
  buildParentDocumentFolderSegment,
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

  it("builds parent folder as Nazwisko Imię - parentId", () => {
    expect(
      buildParentDocumentFolderSegment({
        parentUserId,
        parentFirstName: "jan",
        parentLastName: "kowalski",
      })
    ).toBe(`Kowalski Jan - ${parentUserId}`);
  });

  it("builds umowy as {schoolId}/{schoolYear}/{Nazwisko Imię - parentId}/umowy", () => {
    expect(
      buildSignedContractR2Prefix({
        schoolId,
        parentUserId,
        schoolYearName: "2025/2026",
        parentFirstName: "Anna",
        parentLastName: "Nowak",
      })
    ).toBe(`${schoolId}/2025-2026/Nowak Anna - ${parentUserId}/umowy`);
  });

  it("builds faktury on the same parent folder layout", () => {
    expect(
      buildInvoiceR2Prefix({
        schoolId,
        schoolYearName: "2025/2026",
        parentUserId,
        parentFirstName: "Anna",
        parentLastName: "Nowak",
      })
    ).toBe(`${schoolId}/2025-2026/Nowak Anna - ${parentUserId}/faktury`);
  });

  it("keeps legacy helper for old {userId}/{year}/kind paths", () => {
    expect(
      buildClientDocumentR2Prefix({
        parentUserId,
        year: 2026,
        kind: "faktury",
      })
    ).toBe(`${parentUserId}/2026/faktury`);
  });

  it("akceptuje nowy klucz oraz legacy", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `${schoolId}/2025-2026/Nowak Anna - ${parentUserId}/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
        kind: "umowy",
      })
    ).toBe(true);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${schoolId}/2025-2026/Nowak Anna - ${parentUserId}/faktury/Faktura.pdf`,
        parentUserId,
        schoolId,
        kind: "faktury",
      })
    ).toBe(true);
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
        key: `${schoolId}/2025-2026/Nowak Anna - other-parent/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `other-school/2025-2026/Nowak Anna - ${parentUserId}/umowy/Umowa.pdf`,
        parentUserId,
        schoolId,
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${schoolId}/2025-2026/Nowak Anna - ${parentUserId}/faktury/Faktura.pdf`,
        parentUserId,
        schoolId,
        kind: "umowy",
      })
    ).toBe(false);
  });
});
