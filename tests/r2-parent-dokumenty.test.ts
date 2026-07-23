import { describe, expect, it } from "vitest";
import {
  buildClientDocumentR2Prefix,
  buildInvoiceR2Prefix,
  buildSignedContractR2Prefix,
  isParentDokumentyKeyAllowed,
} from "@/lib/r2-storage";

describe("R2 client document paths", () => {
  const parentUserId = "parent-uuid-1";

  it("builds {userId}/{year}/umowy|faktury", () => {
    expect(
      buildClientDocumentR2Prefix({
        parentUserId,
        year: 2026,
        kind: "umowy",
      })
    ).toBe(`${parentUserId}/2026/umowy`);
    expect(
      buildInvoiceR2Prefix({
        parentUserId,
        issuedAt: new Date("2026-09-15T12:00:00Z"),
      })
    ).toBe(`${parentUserId}/2026/faktury`);
    expect(
      buildSignedContractR2Prefix({
        parentUserId,
        signedAt: new Date("2026-07-01T12:00:00Z"),
      })
    ).toBe(`${parentUserId}/2026/umowy`);
  });

  it("akceptuje klucz w folderze rodzica", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/umowy/Umowa.pdf`,
        parentUserId,
      })
    ).toBe(true);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/faktury/Faktura.pdf`,
        parentUserId,
        kind: "faktury",
      })
    ).toBe(true);
  });

  it("odrzuca klucz innego rodzica lub złą ścieżkę", () => {
    expect(
      isParentDokumentyKeyAllowed({
        key: `other-parent/2026/umowy/Umowa.pdf`,
        parentUserId,
      })
    ).toBe(false);
    expect(
      isParentDokumentyKeyAllowed({
        key: `${parentUserId}/2026/faktury/Faktura.pdf`,
        parentUserId,
        kind: "umowy",
      })
    ).toBe(false);
  });
});
