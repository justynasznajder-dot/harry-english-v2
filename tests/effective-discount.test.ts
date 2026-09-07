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

  it("tryb bez umowy: KDR i rodzeństwo się sumują", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 10,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(25);
    expect(r.familyOrSiblingKey).toBeNull();
    expect(r.familyOrSiblingPercent).toBe(15);
    expect(r.source).toBe("stack");
  });

  it("tryb bez umowy: sam KDR + rodzeństwo bez managera się sumują", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: null,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(15);
    expect(r.source).toBe("stack");
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

  it("umowa: ignoruje rabat managera — bierze KDR", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 14,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(10);
    expect(r.source).toBe(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
    expect(r.managerPercent).toBe(0);
  });

  it("umowa: KDR 10%", () => {
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

  it("umowa: rodzeństwo 5% bez KDR", () => {
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
