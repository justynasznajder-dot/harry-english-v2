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

  return /^\d{11}$/.test(String(profile.pesel ?? "").trim());
}

export function isExactDigits(value: string, length: number): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value.trim());
}

export function validateParentContractProfileInput(input: {
  billingType: BillingType;
  address: string;
  city: string;
  zipCode: string;
  pesel: string;
  companyName: string;
  nip: string;
}): string | null {
  if (!input.address.trim() || !input.city.trim() || !input.zipCode.trim()) {
    return "Uzupełnij adres, miasto i kod pocztowy.";
  }
  if (input.billingType === "private") {
    if (!input.pesel.trim()) return "Podaj numer PESEL.";
    if (!isExactDigits(input.pesel, 11)) return "PESEL musi składać się z dokładnie 11 cyfr.";
    return null;
  }
  if (!input.companyName.trim() || !input.nip.trim()) {
    return "Dla faktury na firmę podaj nazwę firmy i NIP.";
  }
  if (!isExactDigits(input.nip, 10)) return "NIP musi składać się z dokładnie 10 cyfr.";
  return null;
}
