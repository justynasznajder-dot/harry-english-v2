import { describe, expect, it } from "vitest";

import {
  parseIngAmount,
  parseIngBankStatementCsv,
  parseIngDate,
  titleContainsClientNumber,
  titleContainsInvoiceNumber,
  titleHasClientOrDocumentRef,
} from "@/lib/bank-statement-parse";

const SAMPLE = `Lista transakcji;;;;;ING Bank
;;;;;;;;;;;;;;;
Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Nazwa banku;Szczegóły;Nr transakcji;Kwota transakcji (waluta rachunku);Waluta;Kwota blokady/zwolnienie blokady;Waluta;Kwota płatności w walucie;Waluta;Saldo po transakcji;Waluta
26.07.2026;26.07.2026;Anna Sznajder;00012/7/2026/1;'27103000;Bank Handlowy;PRZELEW  ;'202536497208460762';10;PLN;;;;;10;PLN
26.07.2026;26.07.2026;Justyna Sznajder;klient 00007;'59102025;PKOBP;PRZELEW  ;'202536497203264439';20,50;PLN;;;;;20,50;PLN
`;

describe("parseIngBankStatementCsv", () => {
  it("parses ING CSV rows", () => {
    const rows = parseIngBankStatementCsv(SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      transactionDate: "2026-07-26",
      bookingDate: "2026-07-26",
      counterparty: "Anna Sznajder",
      title: "00012/7/2026/1",
      amount: 10,
      currency: "PLN",
      bankTransactionId: "202536497208460762",
    });
    expect(rows[1].amount).toBe(20.5);
    expect(rows[1].title).toBe("klient 00007");
  });

  it("matches invoice and client numbers in title", () => {
    expect(titleContainsInvoiceNumber("przelew 00012/7/2026/1 ok", "00012/7/2026/1")).toBe(true);
    expect(titleContainsClientNumber("klient 00007", "00007")).toBe(true);
    expect(titleContainsClientNumber("00012/7/2026/1", "00012")).toBe(true);
    expect(titleContainsClientNumber("rachunek 0000712345", "00007")).toBe(false);
  });

  it("detects missing client/document refs", () => {
    expect(titleHasClientOrDocumentRef("przelew za zajęcia")).toBe(false);
    expect(titleHasClientOrDocumentRef("klient 00007")).toBe(true);
    expect(titleHasClientOrDocumentRef("00012/7/2026/1")).toBe(true);
    expect(titleHasClientOrDocumentRef("00012/1/2026")).toBe(true);
  });

  it("parses dates and amounts", () => {
    expect(parseIngDate("1.7.2026")).toBe("2026-07-01");
    expect(parseIngAmount("1 234,56")).toBe(1234.56);
  });
});
