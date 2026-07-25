import { describe, expect, it } from "vitest";

import {
  buildEppDocumentText,
  encodeWindows1250,
  eppDocumentFullNumber,
  formatEppAmount,
  formatEppDate,
  parseAddressParts,
} from "@/lib/epp";

describe("formatEppDate", () => {
  it("formats YYYY-MM-DD as yyyymmdd000000", () => {
    expect(formatEppDate("2026-05-20")).toBe("20260520000000");
  });
});

describe("formatEppAmount", () => {
  it("drops trailing zeros for whole amounts", () => {
    expect(formatEppAmount(270)).toBe("270");
    expect(formatEppAmount(270.0)).toBe("270");
  });

  it("keeps grosze", () => {
    expect(formatEppAmount(160.5)).toBe("160.50");
  });
});

describe("parseAddressParts", () => {
  it("parses street, zip, city", () => {
    expect(parseAddressParts("ul. Powstańców Śląskich 36, 44-177 Paniówki")).toEqual({
      street: "ul. Powstańców Śląskich 36",
      zip: "44-177",
      city: "Paniówki",
    });
  });

  it("normalizes street with comma before house number", () => {
    expect(parseAddressParts("Kingi, 14d, 41-711 Ruda Śląska")).toEqual({
      street: "Kingi 14d",
      zip: "41-711",
      city: "Ruda Śląska",
    });
  });
});

describe("eppDocumentFullNumber", () => {
  it("keeps school invoice numbers unchanged", () => {
    expect(eppDocumentFullNumber("SALE", "00001/05/2026/1")).toBe("00001/05/2026/1");
    expect(eppDocumentFullNumber("CORRECTIVE", "00001/05/2026/1/K1")).toBe(
      "00001/05/2026/1/K1"
    );
  });
});

describe("encodeWindows1250", () => {
  it("encodes Polish characters as CP1250", () => {
    const buf = encodeWindows1250("Paniówki");
    expect([...buf]).toEqual([0x50, 0x61, 0x6e, 0x69, 0xf3, 0x77, 0x6b, 0x69]);
    expect(encodeWindows1250("Łódź")[0]).toBe(0xa3);
  });
});

describe("buildEppDocumentText", () => {
  it("builds INFO + FS + zw + auxiliary sections like Subiekt sample", () => {
    const text = buildEppDocumentText({
      yearMonth: "2026-05",
      generatedAt: new Date("2026-06-11T16:45:32"),
      programName: "HarryEnglish",
      invoices: [
        {
          invoiceNumber: "00001/05/2026/1",
          documentType: "SALE",
          originalInvoiceNumber: null,
          issueDate: "2026-05-20",
          saleDate: "2026-05-20",
          dueDate: "2026-06-03",
          buyerCode: "00001",
          buyerName: "Agata Książek",
          buyerAddress: "ul. Powstańców Śląskich 36, 44-177 Paniówki",
          buyerNip: null,
          buyerEmail: "agata@example.com",
          amount: 270,
          paymentStatus: "PAID",
          issuePlace: "Paniówki",
          sellerName: "FIRMA HANDLOWO USŁUGOWA MICHAŁ SZNAJDER",
          sellerAddress: "Powstańców Śląskich 146, 44-177 Paniówki",
          sellerNip: "6412394661",
          issuerName: "Michał Sznajder",
        },
      ],
    });

    expect(text.startsWith("[INFO]\r\n")).toBe(true);
    expect(text).toContain('"1.12",0,1250,');
    expect(text).toContain("[NAGLOWEK]\r\n\"FS\",1,0,1,");
    expect(text).toContain('"00001/05/2026/1"');
    expect(text).toContain('[ZAWARTOSC]\r\n"zw",0,270,0,270,270,0,270,0,0,0,0,0,0,0,0,0,0');
    expect(text).toMatch(/20260520000000,20260520000000,,1,0,"Detaliczny"/);
    expect(text).toContain('"WYMAGALNOSCMPP"');
    expect(text).toContain('"KONTRAHENCI"');
    expect(text).toContain('"DOKUMENTYZNACZNIKIJPKVAT"');
    expect(text.endsWith("\r\n")).toBe(true);
  });
});
