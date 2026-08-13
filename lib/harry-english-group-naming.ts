import {
  groupNameMatchesLevel,
  normalizeHarryEnglishLevel,
} from "@/src/data/harryEnglishLevels";

/** Walidacja poziomu i spięcia z nazwą grupy (Harry English). */
export function validateHarryEnglishGroupNaming(input: {
  name?: string | null;
  level?: string | null;
  /** Przy tworzeniu poziom i nazwa są wymagane. */
  requireLevel?: boolean;
}): { ok: true; level: string | null; name: string } | { ok: false; message: string } {
  const name = String(input.name ?? "").trim();
  if (!name) {
    return { ok: false, message: "Nazwa grupy jest wymagana" };
  }

  const rawLevel = input.level == null ? "" : String(input.level).trim();
  if (!rawLevel) {
    if (input.requireLevel) {
      return {
        ok: false,
        message: "Wybierz poziom (P3–P6, Sz1–Sz8, Sz8E)",
      };
    }
    return { ok: true, level: null, name };
  }

  const level = normalizeHarryEnglishLevel(rawLevel);
  if (!level) {
    return {
      ok: false,
      message: "Nieprawidłowy poziom. Dozwolone: P3–P6, Sz1–Sz8, Sz8E",
    };
  }

  if (!groupNameMatchesLevel(name, level)) {
    return {
      ok: false,
      message: `Nazwa grupy musi zaczynać się od poziomu ${level}`,
    };
  }

  return { ok: true, level, name };
}
