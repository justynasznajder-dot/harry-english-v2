import { describe, expect, it } from "vitest";

import { amountInWordsPln, formatInvoiceDatePl } from "@/lib/invoice-html";

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
