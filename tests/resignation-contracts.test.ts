import { describe, expect, it } from "vitest";
import { buildContractAmountBreakdown } from "@/lib/contract-amount-breakdown";
import { DISCOUNT_KEYS } from "@/lib/school-discounts";

describe("resignation pricing expectation", () => {
  it("po odejściu jednego dziecka znika rabat rodzeństwa", () => {
    const withSibling = buildContractAmountBreakdown({
      paymentType: "MONTHLY",
      billingExempt: false,
      discountKeys: [DISCOUNT_KEYS.SIBLING],
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 0 },
      children: [
        {
          child_id: "a",
          name: "A",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
        {
          child_id: "b",
          name: "B",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
      ],
    });

    const afterResignation = buildContractAmountBreakdown({
      paymentType: "MONTHLY",
      billingExempt: false,
      discountKeys: [], // jedno dziecko — bez SIBLING
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 0 },
      children: [
        {
          child_id: "b",
          name: "B",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
      ],
    });

    expect(withSibling.final_total).toBe(285);
    expect(afterResignation.final_total).toBe(150);
    expect(afterResignation.discounts).toEqual([]);
  });
});
