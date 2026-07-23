import { describe, expect, it } from "vitest";
import {
  buildContractAmountBreakdown,
  recomputeFinalTotalFromBreakdown,
} from "@/lib/contract-amount-breakdown";
import { DISCOUNT_KEYS } from "@/lib/school-discounts";

describe("buildContractAmountBreakdown", () => {
  it("liczy sumę z rabatem rodzeństwa i zapisuje wszystkie stawki", () => {
    const breakdown = buildContractAmountBreakdown({
      paymentType: "MONTHLY",
      billingExempt: false,
      discountKeys: [DISCOUNT_KEYS.SIBLING],
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 10 },
      children: [
        {
          child_id: "c1",
          name: "Piotrek Makowski",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
        {
          child_id: "c2",
          name: "Justyna Sznajder",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
      ],
    });

    expect(breakdown.base_total).toBe(300);
    expect(breakdown.final_total).toBe(285);
    expect(breakdown.discounts).toEqual([
      { key: "SIBLING", label: "Rodzeństwo", percent: 5 },
    ]);
    expect(breakdown.children[0]?.monthly_unit_price).toBe(150);
    expect(breakdown.children[0]?.lesson_unit_price).toBe(50);
    expect(breakdown.children[0]?.yearly_unit_price).toBe(1400);
    expect(breakdown.frozen_at).toBeNull();
  });

  it("dla PER_LESSON zostawia final_total null, ale trzyma stawki", () => {
    const breakdown = buildContractAmountBreakdown({
      paymentType: "PER_LESSON",
      billingExempt: false,
      discountKeys: [],
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 10 },
      children: [
        {
          child_id: "c1",
          name: "Piotrek",
          lesson_unit_price: 55,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
      ],
      frozenAt: new Date("2026-07-19T12:00:00.000Z"),
    });

    expect(breakdown.final_total).toBeNull();
    expect(breakdown.children[0]?.lesson_unit_price).toBe(55);
    expect(breakdown.frozen_at).toBe("2026-07-19T12:00:00.000Z");
  });

  it("recomputeFinalTotalFromBreakdown używa zapisanych procentów", () => {
    const breakdown = buildContractAmountBreakdown({
      paymentType: "YEARLY",
      billingExempt: false,
      discountKeys: [DISCOUNT_KEYS.SIBLING],
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 0 },
      children: [
        {
          child_id: "c1",
          name: "A",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1000,
        },
        {
          child_id: "c2",
          name: "B",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1000,
        },
      ],
    });

    expect(recomputeFinalTotalFromBreakdown(breakdown)).toBe(1900);
  });
});
