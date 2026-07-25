import { describe, expect, it } from "vitest";

import {
  amountInWordsPln,
  buildInvoiceItemRowsHtml,
  buildInvoicePlaceholders,
  formatInvoiceDatePl,
  sumInvoiceItemValues,
} from "@/lib/invoice-html";

describe("amountInWordsPln", () => {
  it("formats whole złoty amounts like Subiekt samples", () => {
    expect(amountInWordsPln(160)).toBe("sto sześćdziesiąt PLN");
    expect(amountInWordsPln(270)).toBe("dwieście siedemdziesiąt PLN");
    expect(amountInWordsPln(304)).toBe("trzysta cztery PLN");
  });

  it("includes grosze when present", () => {
    expect(amountInWordsPln(160.5)).toBe("sto sześćdziesiąt 50/100 PLN");
  });
});

describe("formatInvoiceDatePl", () => {
  it("formats YYYY-MM-DD strings as DD-MM-YYYY", () => {
    expect(formatInvoiceDatePl("2026-06-22")).toBe("22-06-2026");
  });
});

describe("multi-item invoice HTML", () => {
  const items = [
    { name: "Kurs — Anna — 2026-07", unitPrice: 150, value: 150 },
    { name: "Kurs — Jan — 2026-07", unitPrice: 160, value: 160 },
  ];

  it("sums item values", () => {
    expect(sumInvoiceItemValues(items)).toBe(310);
  });

  it("renders multiple table rows", () => {
    const rows = buildInvoiceItemRowsHtml(items);
    expect(rows).toContain(">1</td>");
    expect(rows).toContain(">2</td>");
    expect(rows).toContain("Kurs — Anna — 2026-07");
    expect(rows).toContain("Kurs — Jan — 2026-07");
  });

  it("puts all items into placeholders and totals", () => {
    const placeholders = buildInvoicePlaceholders({
      invoiceNumber: "00001/7/2026/1",
      issueDate: new Date("2026-07-10T12:00:00"),
      saleDate: new Date("2026-07-31T12:00:00"),
      dueDate: "2026-07-31",
      issuePlace: "Paniówki",
      sellerName: "Szkoła",
      sellerAddress: "ul. Test 1",
      sellerNip: "1234567890",
      buyerName: "Rodzic",
      buyerAddress: "ul. Dom 2",
      buyerNip: null,
      items,
      bankLabel: "Bank",
      bankAccount: "12 3456",
      vatExemption: "zw",
      issuerName: "Księgowa",
    });
    expect(placeholders.items_rows).toContain("Kurs — Anna — 2026-07");
    expect(placeholders.items_rows).toContain("Kurs — Jan — 2026-07");
    expect(placeholders.total_amount).toContain("310");
    expect(placeholders.item_name).toBe("Kurs — Anna — 2026-07");
  });
});
