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
