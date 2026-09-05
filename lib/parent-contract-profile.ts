import type { ParentProfile } from "@/lib/db";

export type BillingType = "private" | "company";

export function resolveBillingTypeFromProfile(
  profile: Pick<ParentProfile, "company_name" | "nip" | "pesel"> | null | undefined,
): BillingType {
  if (!profile) return "private";
  const companyName = String(profile.company_name ?? "").trim();
  const nip = String(profile.nip ?? "").trim();
  return companyName.length > 0 || nip.length > 0 ? "company" : "private";
}

export function isParentContractProfileComplete(
  profile: Pick<
    ParentProfile,
    "address" | "city" | "zip_code" | "pesel" | "company_name" | "nip"
  > | null | undefined,
): boolean {
  if (!profile) return false;
  const address = String(profile.address ?? "").trim();
  const city = String(profile.city ?? "").trim();
  const zipCode = String(profile.zip_code ?? "").trim();
  if (!address || !city || !zipCode) return false;

  const billingType = resolveBillingTypeFromProfile(profile);
  if (billingType === "company") {
    const companyName = String(profile.company_name ?? "").trim();
    const nip = String(profile.nip ?? "").trim();
    return companyName.length > 0 && /^\d{10}$/.test(nip);
  }

  // Osoba prywatna: do umowy wystarczy adres (PESEL nie jest zbierany).
  return true;
}

export function isExactDigits(value: string, length: number): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value.trim());
}

/**
 * Upewnia się, że ulica w adresie rodzica ma prefiks „ul. ”.
 * Nie nadpisuje innych typów (al., pl., os. itd.).
 */
export function ensureStreetUlPrefix(address: string): string {
  const trimmed = String(address ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!trimmed) return "";

  if (/^ulica\s+/i.test(trimmed)) {
    return trimmed.replace(/^ulica\s+/i, "ul. ");
  }
  if (/^ul\.?\s+/i.test(trimmed)) {
    return trimmed.replace(/^ul\.?\s+/i, "ul. ");
  }
  if (/^(al\.?|aleja|pl\.?|plac|os\.?|osiedle|rondo|skwer)\s+/i.test(trimmed)) {
    return trimmed;
  }

  return `ul. ${trimmed}`;
}

export function validateParentContractProfileInput(input: {
  billingType: BillingType;
  address: string;
  city: string;
  zipCode: string;
  pesel?: string;
  companyName: string;
  nip: string;
}): string | null {
  if (input.billingType === "private") {
    if (!input.address.trim() || !input.city.trim() || !input.zipCode.trim()) {
      return "Uzupełnij adres, miasto i kod pocztowy.";
    }
    return null;
  }

  if (!input.companyName.trim()) {
    return "Dla faktury na firmę podaj nazwę firmy.";
  }
  if (!input.nip.trim()) {
    return "Dla faktury na firmę podaj NIP.";
  }
  if (!isExactDigits(input.nip, 10)) return "NIP musi składać się z dokładnie 10 cyfr.";
  if (!input.address.trim() || !input.city.trim() || !input.zipCode.trim()) {
    return "Dla faktury na firmę podaj pełny adres siedziby (ulica, miasto, kod pocztowy).";
  }
  return null;
}
