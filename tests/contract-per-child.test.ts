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

  it("rabat rodzeństwa — final = base − 5%", () => {
    const preview = computeContractPreviewAmount(150, true, pricing);
    expect(preview.finalTotal).toBe(142.5);
    expect(preview.discountKeys).toEqual([DISCOUNT_KEYS.SIBLING]);
  });

  it("bez rabatu gdy siblingEligible=false (jedno dziecko)", () => {
    const preview = computeContractPreviewAmount(150, false, pricing);
    expect(preview.finalTotal).toBe(150);
    expect(preview.discountKeys).not.toContain(DISCOUNT_KEYS.SIBLING);
  });

  it("resolveContractDiscountKeys: KDR wyłącza rodzeństwo", () => {
    expect(resolveContractDiscountKeys(true, pricing)).toEqual([DISCOUNT_KEYS.SIBLING]);
    expect(resolveContractDiscountKeys(false, pricing)).toEqual([]);
    expect(
      resolveContractDiscountKeys(true, { ...pricing, discountLargeFamily: true })
    ).toEqual([DISCOUNT_KEYS.LARGE_FAMILY_CARD]);
  });

  it("resolveContractDiscountKeys: ceny ręczne nie blokują zniżek", () => {
    expect(
      resolveContractDiscountKeys(true, {
        ...pricing,
        discountLargeFamily: true,
        hasIndividualPricing: true,
      })
    ).toEqual([DISCOUNT_KEYS.LARGE_FAMILY_CARD]);
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

  it("breakdown jednej umowy = jedno dziecko z rabatem rodzeństwa", () => {
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
    expect(breakdown.base_total).toBe(150);
    expect(breakdown.final_total).toBe(142.5);
    expect(breakdown.discounts).toHaveLength(1);
  });

  it("validateSingleChildForContract wymaga jednego dziecka", () => {
    expect(validateSingleChildForContract(null).ok).toBe(false);
  });
});
