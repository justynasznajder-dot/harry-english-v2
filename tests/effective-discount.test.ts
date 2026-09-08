import { describe, expect, it } from "vitest";
import {
  DISCOUNT_KEYS,
  resolveEffectiveDiscountPercent,
} from "@/lib/discount-math";

const settings = { LARGE_FAMILY_CARD: 10, SIBLING: 5 };

describe("resolveEffectiveDiscountPercent", () => {
  it("tryb bez umowy: manager 14% + KDR 10% = 24%", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 14,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: false,
      settings,
    });
    expect(r.percent).toBe(24);
  });

  it("tryb bez umowy: manager 14% + rodzeństwo 5% = 19%", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 14,
      hasLargeFamilyCard: false,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(19);
  });

  it("tryb bez umowy: manager 50% + rodzeństwo 5% = 55%", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: 50,
      hasLargeFamilyCard: false,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(55);
    expect(r.source).toBe("stack");
  });

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

  it("umowa: manager 50% wygrywa z KDR 10%", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 50,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: true,
      settings,
    });
    expect(r.percent).toBe(50);
    expect(r.source).toBe("manager");
    expect(r.managerPercent).toBe(50);
    expect(r.familyOrSiblingKey).toBe(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
  });

  it("umowa: manager 50% bez kliknięć rodzica", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 50,
      hasLargeFamilyCard: false,
      hasSiblingDeclared: false,
      settings,
    });
    expect(r.percent).toBe(50);
    expect(r.source).toBe("manager");
  });

  it("umowa: KDR 10% wygrywa z managerem 5%", () => {
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

  it("umowa: rodzeństwo 5% bez KDR gdy manager niższy", () => {
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

  it("umowa: przy remisie manager vs KDR wygrywa manager", () => {
    const r = resolveEffectiveDiscountPercent({
      mode: "contract",
      managerPercent: 10,
      hasLargeFamilyCard: true,
      hasSiblingDeclared: false,
      settings,
    });
    expect(r.percent).toBe(10);
    expect(r.source).toBe("manager");
  });
});
