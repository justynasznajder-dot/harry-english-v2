import { queryDb } from "@/lib/db";
import {
  allocateUniqueGroupName,
  buildGroupNameBase,
  normalizeHarryEnglishLevel,
} from "@/src/data/harryEnglishLevels";

/** Walidacja poziomu i nazwy grupy (Harry English). Nazwa nie musi zaczynać się od poziomu. */
export function validateHarryEnglishGroupNaming(input: {
  name?: string | null;
  level?: string | null;
  /** Przy tworzeniu poziom i nazwa są wymagane. */
  requireLevel?: boolean;
  /**
   * Przy edycji istniejącej grupy: pozwól zachować poziom spoza nowej listy
   * (np. „Podstawowy”), bez wymuszania migracji przy każdej zmianie pól.
   */
  allowLegacyLevel?: boolean;
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
    if (input.allowLegacyLevel) {
      return { ok: true, level: rawLevel, name };
    }
    return {
      ok: false,
      message: "Nieprawidłowy poziom. Dozwolone: P3–P6, Sz1–Sz8, Sz8E",
    };
  }

  return { ok: true, level, name };
}

export async function listActiveGroupNamesInSchool(
  schoolId: string,
  excludeGroupId?: string | null
): Promise<string[]> {
  const res = await queryDb<{ name: string }>(
    `SELECT name FROM groups
     WHERE school_id = $1
       AND active = TRUE
       AND ($2::text IS NULL OR id <> $2::text)`,
    [schoolId, excludeGroupId ?? null]
  );
  return res.rows.map((r) => r.name);
}

/** Unikalna nazwa wśród aktywnych grup szkoły: baza, potem (2), (3)… */
export async function resolveUniqueActiveGroupName(params: {
  schoolId: string;
  levelCode: string;
  locationName: string;
  excludeGroupId?: string | null;
}): Promise<{ ok: true; name: string } | { ok: false; message: string }> {
  const base = buildGroupNameBase(params.levelCode, params.locationName);
  if (!base) {
    return { ok: false, message: "Wybierz poziom i lokalizację — nazwa powstaje automatycznie" };
  }
  const existing = await listActiveGroupNamesInSchool(
    params.schoolId,
    params.excludeGroupId
  );
  return { ok: true, name: allocateUniqueGroupName(base, existing) };
}

export async function findActiveGroupNameConflict(params: {
  schoolId: string;
  name: string;
  excludeGroupId?: string | null;
}): Promise<boolean> {
  const res = await queryDb<{ id: string }>(
    `SELECT id FROM groups
     WHERE school_id = $1
       AND active = TRUE
       AND ($2::text IS NULL OR id <> $2::text)
       AND LOWER(BTRIM(name)) = LOWER(BTRIM($3))
     LIMIT 1`,
    [params.schoolId, params.excludeGroupId ?? null, params.name]
  );
  return (res.rowCount ?? 0) > 0;
}
