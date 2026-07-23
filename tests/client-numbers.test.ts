import { describe, expect, it } from "vitest";

import {
  buildAnnexContractNumber,
  buildBaseContractNumber,
  buildCorrectiveInvoiceNumber,
  buildSaleInvoiceNumber,
  formatChildClientNumber,
  formatParentClientNumber,
  isAnnexContractNumber,
  parseBaseContractIndex,
} from "@/lib/client-numbers";
import {
  extractContractNumber,
  nextBaseContractIndex,
} from "@/lib/contract-html";

describe("formatParentClientNumber", () => {
  it("pads to 5 digits", () => {
    expect(formatParentClientNumber(1)).toBe("00001");
    expect(formatParentClientNumber(42)).toBe("00042");
  });
});

describe("formatChildClientNumber", () => {
  it("joins parent number and sequence", () => {
    expect(formatChildClientNumber("00001", 1)).toBe("00001/1");
    expect(formatChildClientNumber("00042", 3)).toBe("00042/3");
  });
});

describe("contract numbers", () => {
  it("builds base ChildID/year and /n for later contracts", () => {
    expect(
      buildBaseContractNumber({
        childClientNumber: "00001/1",
        year: 2026,
        baseIndex: 1,
      })
    ).toBe("00001/1/2026");
    expect(
      buildBaseContractNumber({
        childClientNumber: "00001/1",
        year: 2026,
        baseIndex: 2,
      })
    ).toBe("00001/1/2026/2");
  });

  it("builds annex numbers", () => {
    expect(buildAnnexContractNumber("00001/1/2026", 1)).toBe("00001/1/2026/A1");
    expect(buildAnnexContractNumber("00001/1/2026/2", 2)).toBe(
      "00001/1/2026/2/A2"
    );
    expect(isAnnexContractNumber("00001/1/2026/A1")).toBe(true);
    expect(isAnnexContractNumber("00001/1/2026")).toBe(false);
  });

  it("parses base index and next index", () => {
    expect(parseBaseContractIndex("00001/1/2026", "00001/1", 2026)).toBe(1);
    expect(parseBaseContractIndex("00001/1/2026/2", "00001/1", 2026)).toBe(2);
    expect(parseBaseContractIndex("00001/1/2026/A1", "00001/1", 2026)).toBe(
      null
    );
    expect(
      nextBaseContractIndex(["00001/1/2026", "00001/1/2026/A1", "00001/1/2026/2"])
    ).toBe(3);
  });

  it("extracts new format from HTML", () => {
    expect(
      extractContractNumber("<p>Nr umowy: <strong>00001/1/2026</strong></p>")
    ).toBe("00001/1/2026");
    expect(
      extractContractNumber("<p>Nr umowy: 00001/2/2026/A1</p>")
    ).toBe("00001/2/2026/A1");
  });
});

describe("invoice numbers", () => {
  it("builds sale ParentID/month/year/n without month padding", () => {
    expect(
      buildSaleInvoiceNumber({
        parentClientNumber: "00001",
        month: 9,
        year: 2026,
        sequence: 1,
      })
    ).toBe("00001/9/2026/1");
    expect(
      buildSaleInvoiceNumber({
        parentClientNumber: "00042",
        month: 12,
        year: 2026,
        sequence: 3,
      })
    ).toBe("00042/12/2026/3");
  });

  it("builds corrective /K1 /K2 suffixes", () => {
    expect(buildCorrectiveInvoiceNumber("00001/9/2026/1", 1)).toBe(
      "00001/9/2026/1/K1"
    );
    expect(buildCorrectiveInvoiceNumber("00001/9/2026/1", 2)).toBe(
      "00001/9/2026/1/K2"
    );
  });
});
