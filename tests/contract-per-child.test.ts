import { describe, expect, it } from "vitest";
import {
  computeContractPreviewAmount,
  resolveContractDiscountKeys,
} from "@/lib/contract-pricing-preview";
import { buildContractAmountBreakdown } from "@/lib/contract-amount-breakdown";
import { DISCOUNT_KEYS } from "@/lib/school-discounts";
import { validateSingleChildForContract } from "@/lib/parent-contract";

describe("umowa per dziecko — sibling i walidacja", () => {
  const pricing = {
    billingExempt: false,
    discountLargeFamily: false,
    discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 10 },
  };

  it("rabat rodzeństwa przy siblingEligible=true nawet dla jednej kwoty bazowej", () => {
    const preview = computeContractPreviewAmount(150, true, pricing);
    expect(preview.finalTotal).toBe(142.5);
    expect(preview.discountKeys).toContain(DISCOUNT_KEYS.SIBLING);
  });

  it("bez rabatu gdy siblingEligible=false (jedno dziecko)", () => {
    const preview = computeContractPreviewAmount(150, false, pricing);
    expect(preview.finalTotal).toBe(150);
    expect(preview.discountKeys).not.toContain(DISCOUNT_KEYS.SIBLING);
  });

  it("resolveContractDiscountKeys używa flagi boolean", () => {
    expect(resolveContractDiscountKeys(true, pricing)).toEqual([DISCOUNT_KEYS.SIBLING]);
    expect(resolveContractDiscountKeys(false, pricing)).toEqual([]);
  });

  it("breakdown jednej umowy = jedno dziecko z rabatem sibling", () => {
    const breakdown = buildContractAmountBreakdown({
      paymentType: "MONTHLY",
      billingExempt: false,
      discountKeys: [DISCOUNT_KEYS.SIBLING],
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 0 },
      children: [
        {
          child_id: "c1",
          name: "Piotrek",
          lesson_unit_price: 50,
          monthly_unit_price: 150,
          yearly_unit_price: 1400,
        },
      ],
    });
    expect(breakdown.children).toHaveLength(1);
    expect(breakdown.final_total).toBe(142.5);
  });

  it("validateSingleChildForContract wymaga ACCEPTED i grupy", () => {
    expect(validateSingleChildForContract(null).ok).toBe(false);
    const ok = validateSingleChildForContract({
      child_id: "c1",
      request_id: "r1",
      access_level: "ACCEPTED",
      first_name: "A",
      last_name: "B",
      birth_date: "2020-01-01",
      group_id: "g1",
      group_name: "G",
      price_monthly: "150",
      price_yearly: null,
      price_per_lesson: null,
      lesson_unit_price: null,
      monthly_unit_price: null,
      yearly_unit_price: null,
      preferred_location: null,
      preferred_location_name: null,
      teacher_first_name: null,
      teacher_last_name: null,
      teacher_pickup_consent: false,
    });
    expect(ok.ok).toBe(true);
  });
});
