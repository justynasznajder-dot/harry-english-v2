import { describe, expect, it } from "vitest";
import {
  computeContractPreviewAmount,
  resolveContractDiscountKeys,
} from "@/lib/contract-pricing-preview";
import { buildContractAmountBreakdown } from "@/lib/contract-amount-breakdown";
import { applyDiscountsToAmount, DISCOUNT_KEYS, MAX_DISCOUNT_PERCENT } from "@/lib/school-discounts";
import { validateSingleChildForContract } from "@/lib/parent-contract";

describe("umowa per dziecko — sibling i walidacja", () => {
  const pricing = {
    billingExempt: false,
    discountLargeFamily: false,
    discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 10 },
  };

  it("rabat rodzeństwa wyłączony — final = base nawet przy siblingEligible", () => {
    const preview = computeContractPreviewAmount(150, true, pricing);
    expect(preview.finalTotal).toBe(150);
    expect(preview.discountKeys).toEqual([]);
  });

  it("bez rabatu gdy siblingEligible=false (jedno dziecko)", () => {
    const preview = computeContractPreviewAmount(150, false, pricing);
    expect(preview.finalTotal).toBe(150);
    expect(preview.discountKeys).not.toContain(DISCOUNT_KEYS.SIBLING);
  });

  it("resolveContractDiscountKeys: rabaty % wyłączone (zawsze [])", () => {
    expect(resolveContractDiscountKeys(true, pricing)).toEqual([]);
    expect(resolveContractDiscountKeys(false, pricing)).toEqual([]);
    expect(
      resolveContractDiscountKeys(true, { ...pricing, discountLargeFamily: true })
    ).toEqual([]);
  });

  it("resolveContractDiscountKeys: cena indywidualna — nadal brak zniżek", () => {
    expect(
      resolveContractDiscountKeys(true, {
        ...pricing,
        discountLargeFamily: true,
        hasIndividualPricing: true,
      })
    ).toEqual([]);
  });

  it("applyDiscountsToAmount nie przekracza limitu szkoły (maxPercent)", () => {
    const amount = applyDiscountsToAmount(
      100,
      [DISCOUNT_KEYS.SIBLING, DISCOUNT_KEYS.LARGE_FAMILY_CARD],
      { SIBLING: 5, LARGE_FAMILY_CARD: 10, maxPercent: 10 }
    );
    expect(MAX_DISCOUNT_PERCENT).toBe(10);
    expect(amount).toBe(90);
  });

  it("applyDiscountsToAmount respektuje wyższy maxPercent szkoły", () => {
    const amount = applyDiscountsToAmount(100, [DISCOUNT_KEYS.LARGE_FAMILY_CARD], {
      SIBLING: 0,
      LARGE_FAMILY_CARD: 15,
      maxPercent: 20,
    });
    expect(amount).toBe(85);
  });

  it("breakdown jednej umowy = jedno dziecko bez rabatu %", () => {
    const breakdown = buildContractAmountBreakdown({
      paymentType: "MONTHLY",
      billingExempt: false,
      discountKeys: [DISCOUNT_KEYS.SIBLING],
      discountSettings: { SIBLING: 5, LARGE_FAMILY_CARD: 0, maxPercent: 10 },
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
    expect(breakdown.final_total).toBe(150);
  });

  it("validateSingleChildForContract wymaga AWAITING_CONTRACT i grupy", () => {
    expect(validateSingleChildForContract(null).ok).toBe(false);
    const ok = validateSingleChildForContract({
      child_id: "c1",
      request_id: "r1",
      access_level: "AWAITING_CONTRACT",
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
