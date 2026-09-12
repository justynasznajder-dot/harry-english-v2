import {
  formatEffectiveDiscountInfo,
  resolveEffectiveDiscountPercent,
  type EffectiveDiscountResult,
} from "@/lib/discount-math";
import {
  normalizePaymentType,
  parsePriceDecimal,
  type PaymentType,
} from "@/lib/lesson-pricing";
import {
  lessonsPerWeekLabel,
  resolveStudentLessonsPerWeek,
  scaleAmountByLessonsPerWeek,
  type LessonsPerWeek,
} from "@/lib/lessons-per-week";
import { paymentTypeShortLabel } from "@/lib/payment-labels";

export type ContractAmountsVerificationInput = {
  yearlyUnitPrice?: string | number | null;
  monthlyUnitPrice?: string | number | null;
  lessonUnitPrice?: string | number | null;
  /** Frekwencja z enrollment_requests. */
  enrollmentLessonsPerWeek?: number | null;
  /** Frekwencja grupy (proposed / membership). */
  groupLessonsPerWeek?: number | null;
  /** Override na group_students. */
  studentLessonsPerWeek?: number | null;
  managerDiscountPercent?: string | number | null;
  hasKdr: boolean;
  hasSibling: boolean;
  complimentary: boolean;
  discountSettings: { LARGE_FAMILY_CARD: number; SIBLING: number };
  /** Zamrożone stawki z contract_children (po skali frekwencji, przed rabatem na umowie). */
  contractYearlyUnitPrice?: string | number | null;
  contractMonthlyUnitPrice?: string | number | null;
  contractLessonUnitPrice?: string | number | null;
  contractPaymentType?: string | null;
  /** contracts.amount — kwota na umowie / fakturze (YEARLY/MONTHLY). */
  contractAmount?: string | number | null;
  contractBillingExempt?: boolean;
  /** Rabaty zamrożone na umowie (gdy podpisana). */
  contractHasKdr?: boolean;
  contractHasSibling?: boolean;
};

export type ContractAmountsVerificationRow = {
  lessonsPerWeek: LessonsPerWeek;
  lessonsPerWeekLabel: string;
  discount: EffectiveDiscountResult;
  discountLabel: string | null;
  /** Wyliczenie bieżące (jak przed podpisem / weryfikacja systemu). */
  preview: {
    yearly: number | null;
    monthly: number | null;
    lesson: number | null;
  };
  /** Stawki zamrożone na umowie (contract_children), bez ponownego rabatu. */
  onContract: {
    yearly: number | null;
    monthly: number | null;
    lesson: number | null;
  } | null;
  paymentType: PaymentType | null;
  paymentTypeLabel: string | null;
  /** Kwota jak na fakturze: YEARLY/MONTHLY → contracts.amount; PER_LESSON → stawka za zajęcia. */
  invoiceAmount: number | null;
  invoiceAmountSource: "contract" | "preview" | "none";
};

function applyPreviewAmount(
  unit: number | null,
  paymentType: PaymentType,
  lessonsPerWeek: LessonsPerWeek,
  discountPercent: number
): number | null {
  if (unit == null) return null;
  const scaled =
    paymentType === "PER_LESSON"
      ? unit
      : scaleAmountByLessonsPerWeek(unit, lessonsPerWeek);
  if (scaled == null) return null;
  if (discountPercent <= 0) return Math.round(scaled * 100) / 100;
  return Math.round(scaled * (1 - discountPercent / 100) * 100) / 100;
}

/**
 * Wylicza 3 kwoty (jednorazowa / ratalna / za zajęcia) + frekwencję
 * do weryfikacji kwot na umowie / fakturze.
 */
export function buildContractAmountsVerification(
  input: ContractAmountsVerificationInput
): ContractAmountsVerificationRow {
  const lessonsPerWeek = resolveStudentLessonsPerWeek({
    studentLessonsPerWeek: input.studentLessonsPerWeek,
    groupLessonsPerWeek: input.groupLessonsPerWeek,
    enrollmentLessonsPerWeek: input.enrollmentLessonsPerWeek,
  });

  const mode = input.complimentary ? "complimentary" : "contract";
  const discount = resolveEffectiveDiscountPercent({
    mode,
    managerPercent: input.managerDiscountPercent,
    hasLargeFamilyCard: input.hasKdr,
    // Jak przy umowie: przy KDR rodzeństwo nie jest deklarowane osobno.
    hasSiblingDeclared: input.hasSibling && !input.hasKdr,
    settings: input.discountSettings,
  });

  const hasSignedContract =
    input.contractPaymentType != null ||
    input.contractAmount != null ||
    input.contractYearlyUnitPrice != null ||
    input.contractMonthlyUnitPrice != null ||
    input.contractLessonUnitPrice != null;

  const contractDiscount = hasSignedContract
    ? resolveEffectiveDiscountPercent({
        mode: input.complimentary ? "complimentary" : "contract",
        managerPercent: input.managerDiscountPercent,
        hasLargeFamilyCard:
          input.contractHasKdr != null ? input.contractHasKdr : input.hasKdr,
        hasSiblingDeclared: (() => {
          const kdr =
            input.contractHasKdr != null ? input.contractHasKdr : input.hasKdr;
          const sibling =
            input.contractHasSibling != null
              ? input.contractHasSibling
              : input.hasSibling;
          return sibling && !kdr;
        })(),
        settings: input.discountSettings,
      })
    : discount;

  const yearlyUnit = parsePriceDecimal(input.yearlyUnitPrice);
  const monthlyUnit = parsePriceDecimal(input.monthlyUnitPrice);
  const lessonUnit = parsePriceDecimal(input.lessonUnitPrice);

  const preview = {
    yearly: applyPreviewAmount(
      yearlyUnit,
      "YEARLY",
      lessonsPerWeek,
      discount.percent
    ),
    monthly: applyPreviewAmount(
      monthlyUnit,
      "MONTHLY",
      lessonsPerWeek,
      discount.percent
    ),
    lesson: applyPreviewAmount(
      lessonUnit,
      "PER_LESSON",
      lessonsPerWeek,
      discount.percent
    ),
  };

  const hasContractRates =
    input.contractYearlyUnitPrice != null ||
    input.contractMonthlyUnitPrice != null ||
    input.contractLessonUnitPrice != null ||
    input.contractPaymentType != null ||
    input.contractAmount != null;

  const billingExempt = input.contractBillingExempt === true;

  /** Stawki z contract_children są po frekwencji, przed rabatem — tu dokładamy rabat z umowy. */
  const applyContractStored = (raw: string | number | null | undefined) => {
    const base = parsePriceDecimal(raw);
    if (base == null) return null;
    if (billingExempt) return 0;
    if (contractDiscount.percent <= 0) return Math.round(base * 100) / 100;
    return (
      Math.round(base * (1 - contractDiscount.percent / 100) * 100) / 100
    );
  };

  const onContract = hasContractRates
    ? {
        yearly: applyContractStored(input.contractYearlyUnitPrice),
        monthly: applyContractStored(input.contractMonthlyUnitPrice),
        lesson: applyContractStored(input.contractLessonUnitPrice),
      }
    : null;

  const paymentType = normalizePaymentType(input.contractPaymentType);

  let invoiceAmount: number | null = null;
  let invoiceAmountSource: ContractAmountsVerificationRow["invoiceAmountSource"] =
    "none";

  if (billingExempt) {
    invoiceAmount = 0;
    invoiceAmountSource = "contract";
  } else if (paymentType === "PER_LESSON") {
    // Za zajęcia: stawka za lekcję (po rabacie) — z umowy albo z preview.
    const fromAmount = parsePriceDecimal(input.contractAmount);
    const fromStored = onContract?.lesson ?? null;
    invoiceAmount = fromAmount ?? fromStored ?? preview.lesson;
    invoiceAmountSource =
      fromAmount != null || fromStored != null ? "contract" : "preview";
  } else if (paymentType === "YEARLY" || paymentType === "MONTHLY") {
    const fromContract = parsePriceDecimal(input.contractAmount);
    if (fromContract != null) {
      invoiceAmount = fromContract;
      invoiceAmountSource = "contract";
    } else {
      invoiceAmount =
        paymentType === "YEARLY" ? preview.yearly : preview.monthly;
      invoiceAmountSource = "preview";
    }
  }

  return {
    lessonsPerWeek,
    lessonsPerWeekLabel: lessonsPerWeekLabel(lessonsPerWeek),
    discount,
    discountLabel: formatEffectiveDiscountInfo(discount),
    preview,
    onContract,
    paymentType,
    paymentTypeLabel: paymentType ? paymentTypeShortLabel(paymentType) : null,
    invoiceAmount,
    invoiceAmountSource,
  };
}

export function formatVerificationMoney(
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pl-PL", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })} PLN`;
}
