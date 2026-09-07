import { describe, expect, it } from "vitest";
import {
  DISCOUNT_KEYS,
  resolveEffectiveDiscountPercent,
} from "@/lib/discount-math";

const settings = { LARGE_FAMILY_CARD: 10, SIBLING: 5 };

describe("resolveEffectiveDiscountPercent", () => {
  it("tryb bez umowy: KDR + manager się sumują", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 14,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: false,
      settings,
    });
    expect(r.percent).toBe(24);
    expect(r.source).toBe("stack");
  });

  it("tryb bez umowy: rodzeństwo + manager się sumują", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 10,
      hasLargeFamilyCard: false,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(15);
    expect(r.source).toBe("stack");
  });

  it("tryb bez umowy: KDR wygrywa z rodzeństwem (nie sumują się)", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 10,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(20);
    expect(r.familyOrSiblingKey).toBe(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
    expect(r.familyOrSiblingPercent).toBe(10);
  });

  it("tryb bez umowy: manager 100% bez sufitu", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 100,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: false,
      settings,
    });
    expect(r.percent).toBe(100);
  });

  it("umowa: bierze najwyższy z przysługujących (manager > KDR)", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 14,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(14);
    expect(r.source).toBe("manager");
  });

  it("umowa: KDR gdy wyższy od managera", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 5,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: false,
      settings,
    });
    expect(r.percent).toBe(10);
    expect(r.source).toBe(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
  });

  it("umowa: rodzeństwo gdy wyższe od managera i bez KDR", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 3,
      hasLargeFamilyCard: false,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(5);
    expect(r.source).toBe(DISCOUNT_KEYS.SIBLING);
  });
});
