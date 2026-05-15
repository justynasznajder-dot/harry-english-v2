import { randomBytes } from "crypto";

/**
 * Wymagania dla nowego hasła ustawianego po pierwszym logowaniu / przy resetowaniu.
 * Spójne z `app/api/auth/reset-password/route.ts`.
 */
export const PASSWORD_RULES = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSpecial: true,
} as const;

export const PASSWORD_REQUIREMENTS_TEXT =
  "Hasło musi mieć minimum 8 znaków oraz zawierać dużą literę, małą literę, cyfrę i znak specjalny.";

export function validateStrongPassword(password: string): {
  ok: boolean;
  message?: string;
} {
  if (typeof password !== "string" || password.length < PASSWORD_RULES.minLength) {
    return { ok: false, message: "Hasło musi mieć minimum 8 znaków" };
  }
  if (PASSWORD_RULES.requireUpper && !/[A-Z]/.test(password)) {
    return { ok: false, message: "Hasło musi zawierać dużą literę" };
  }
  if (PASSWORD_RULES.requireLower && !/[a-z]/.test(password)) {
    return { ok: false, message: "Hasło musi zawierać małą literę" };
  }
  if (PASSWORD_RULES.requireDigit && !/[0-9]/.test(password)) {
    return { ok: false, message: "Hasło musi zawierać cyfrę" };
  }
  if (
    PASSWORD_RULES.requireSpecial &&
    !/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'/`~]/.test(password)
  ) {
    return { ok: false, message: "Hasło musi zawierać znak specjalny" };
  }
  return { ok: true };
}

const SAFE_LETTERS = "abcdefghjkmnpqrstuvwxyz"; // bez l, i, o
const SAFE_DIGITS = "23456789"; // bez 0, 1

function pickFromAlphabet(alphabet: string, count: number): string {
  if (alphabet.length === 0) return "";
  const out: string[] = [];
  const buf = randomBytes(count * 2);
  let bi = 0;
  while (out.length < count) {
    const byte = buf[bi % buf.length];
    bi += 1;
    const idx = byte % alphabet.length;
    out.push(alphabet[idx]);
    if (bi > count * 32) break; // bezpiecznik
  }
  return out.join("");
}

/**
 * Tymczasowe hasło wysyłane mailem przy „Wyślij propozycję dla dziecka".
 * Format: `xxxx-9999` (4 małe litery + myślnik + 4 cyfry), pomija mylące znaki (0/O, 1/I/l).
 * Nie spełnia reguł `validateStrongPassword` — to celowe: użytkownik jest zmuszony do zmiany.
 */
export function generateTempPassword(): string {
  const letters = pickFromAlphabet(SAFE_LETTERS, 4);
  const digits = pickFromAlphabet(SAFE_DIGITS, 4);
  return `${letters}-${digits}`;
}
