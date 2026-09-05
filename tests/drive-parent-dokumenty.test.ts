import { describe, expect, it } from "vitest";
import {
  buildDriveDocumentKey,
  buildParentDriveFolderName,
  DRIVE_TEST_FOLDER_NAME,
  DRIVE_TEST_SCHOOL_ID,
  isParentDokumentyKeyAllowed,
  parseDriveDocumentKey,
  usesDriveTestFolder,
} from "@/lib/drive-documents-storage";

describe("Google Drive document paths", () => {
  const parentUserId = "parent-uuid-1";

  it("buduje Nazwisko_Imię", () => {
    expect(buildParentDriveFolderName("kowalska", "anna")).toBe("Kowalska_Anna");
  });

  it("odróżnia szkołę testową (folder TEST)", () => {
    expect(usesDriveTestFolder(DRIVE_TEST_SCHOOL_ID)).toBe(true);
    expect(usesDriveTestFolder("c93d5ac1-fa59-497f-b450-a4e50e1fb50d")).toBe(false);
    expect(DRIVE_TEST_FOLDER_NAME).toBe("TEST");
  });

  it("buduje i parsuje klucz gdrive", () => {
    const key = buildDriveDocumentKey({
      parentUserId,
      kind: "umowy",
      fileId: "file-abc",
      filename: "Umowa.pdf",
    });
    expect(key).toBe(`gdrive/${parentUserId}/umowy/file-abc/Umowa.pdf`);
    expect(parseDriveDocumentKey(key)).toEqual({
      parentUserId,
      kind: "umowy",
      fileId: "file-abc",
      filename: "Umowa.pdf",
    });
  });

  it("akceptuje klucz w folderze rodzica", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `gdrive/${parentUserId}/umowy/fid/Umowa.pdf`,
        parentUserId,
      })
    ).toBe(true);
    expect(
      isParentDokumentyKeyAllowed({
        key: `gdrive/${parentUserId}/faktury/fid/Faktura.pdf`,
        parentUserId,
        kind: "faktury",
      })
    ).toBe(true);
  });

  it("odrzuca klucz innego rodzica lub złą ścieżkę", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `gdrive/other-parent/umowy/fid/Umowa.pdf`,
        parentUserId,
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `gdrive/${parentUserId}/faktury/fid/Faktura.pdf`,
        parentUserId,
        kind: "umowy",
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/umowy/Umowa.pdf`,
        parentUserId,
      })
    ).toBe(false);
  });
});
