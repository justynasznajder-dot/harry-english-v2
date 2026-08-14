export function normalizePolishPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  let localNineDigits = "";

  if (digits.length === 9) {
    localNineDigits = digits;
  } else if (digits.length === 11 && digits.startsWith("48")) {
    localNineDigits = digits.slice(2);
  } else {
    return trimmed;
  }

  return `+48 ${localNineDigits.slice(0, 3)} ${localNineDigits.slice(3, 6)} ${localNineDigits.slice(6, 9)}`;
}

/** Cyfry do porównania numerów PL (9 cyfr lokalnych, bez prefiksu 48). */
export function polishPhoneDigits(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("48")) return digits.slice(2);
  return digits;
}

export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const da = polishPhoneDigits(a);
  const db = polishPhoneDigits(b);
  if (!da || !db) return da === db;
  return da === db;
}
