/** Poziomy Harry English — kod = wartość `groups.level` / prefix nazwy grupy. */

export type HarryEnglishLevelCode =
  | 'P3'
  | 'P4'
  | 'P5'
  | 'P6'
  | 'Sz1'
  | 'Sz2'
  | 'Sz3'
  | 'Sz4'
  | 'Sz5'
  | 'Sz6'
  | 'Sz7'
  | 'Sz8'
  | 'Sz8E';

export type HarryEnglishLevel = {
  code: HarryEnglishLevelCode;
  /** Krótki opis do selecta */
  label: string;
  stage: 'preschool' | 'school' | 'exam';
};

export const HARRY_ENGLISH_LEVELS: readonly HarryEnglishLevel[] = [
  { code: 'P3', label: 'P3 — przedszkole, 3 latki', stage: 'preschool' },
  { code: 'P4', label: 'P4 — przedszkole, 4 latki', stage: 'preschool' },
  { code: 'P5', label: 'P5 — przedszkole, 5 latki', stage: 'preschool' },
  { code: 'P6', label: 'P6 — przedszkole, 6 latki', stage: 'preschool' },
  { code: 'Sz1', label: 'Sz1 — szkoła, klasa 1', stage: 'school' },
  { code: 'Sz2', label: 'Sz2 — szkoła, klasa 2', stage: 'school' },
  { code: 'Sz3', label: 'Sz3 — szkoła, klasa 3', stage: 'school' },
  { code: 'Sz4', label: 'Sz4 — szkoła, klasa 4', stage: 'school' },
  { code: 'Sz5', label: 'Sz5 — szkoła, klasa 5', stage: 'school' },
  { code: 'Sz6', label: 'Sz6 — szkoła, klasa 6', stage: 'school' },
  { code: 'Sz7', label: 'Sz7 — szkoła, klasa 7', stage: 'school' },
  { code: 'Sz8', label: 'Sz8 — szkoła, klasa 8', stage: 'school' },
  { code: 'Sz8E', label: 'Sz8E — egzamin 8-klasisty', stage: 'exam' },
] as const;

export const HARRY_ENGLISH_LEVEL_CODES: readonly HarryEnglishLevelCode[] =
  HARRY_ENGLISH_LEVELS.map((l) => l.code);

const LEVEL_CODE_SET = new Set<string>(HARRY_ENGLISH_LEVEL_CODES);

export const GROUP_NAME_SEP = ' · ';

export function isHarryEnglishLevelCode(value: string | null | undefined): value is HarryEnglishLevelCode {
  return Boolean(value && LEVEL_CODE_SET.has(value.trim()));
}

export function normalizeHarryEnglishLevel(
  value: string | null | undefined
): HarryEnglishLevelCode | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return isHarryEnglishLevelCode(trimmed) ? trimmed : null;
}

/** Czy nazwa grupy zaczyna się od kodu poziomu (np. `Sz1` lub `Sz1 · …`). */
export function groupNameMatchesLevel(name: string, level: string): boolean {
  const n = name.trim();
  const lv = level.trim();
  if (!n || !lv) return false;
  return n === lv || n.startsWith(`${lv}${GROUP_NAME_SEP}`) || n.startsWith(`${lv}·`);
}

/**
 * Wykrywa kod poziomu z początku nazwy grupy.
 * Dłuższe kody pierwsze (`Sz8E` przed `Sz8`).
 */
export function detectLevelFromGroupName(name: string): HarryEnglishLevelCode | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const codes = [...HARRY_ENGLISH_LEVEL_CODES].sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (trimmed === code) return code;
    if (
      trimmed.startsWith(`${code}${GROUP_NAME_SEP}`) ||
      trimmed.startsWith(`${code}·`) ||
      trimmed.startsWith(`${code} `)
    ) {
      return code;
    }
  }

  const firstPart = trimmed.split(GROUP_NAME_SEP)[0]?.trim() ?? '';
  return normalizeHarryEnglishLevel(firstPart);
}

export type ParsedGroupName = {
  levelCode: HarryEnglishLevelCode | null;
  location: string;
  /** Dzień/godzina i ewentualny sufiks (np. B) */
  schedule: string;
};

export function parseGroupName(name: string): ParsedGroupName {
  const parts = name
    .split(GROUP_NAME_SEP)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const first = parts[0] ?? '';
  if (isHarryEnglishLevelCode(first)) {
    return {
      levelCode: first,
      location: parts[1] ?? '',
      schedule: parts.slice(2).join(GROUP_NAME_SEP),
    };
  }

  return {
    levelCode: null,
    location: '',
    schedule: name.trim(),
  };
}

export function composeGroupName(
  levelCode: string,
  locationName: string,
  schedule: string
): string {
  const parts: string[] = [levelCode.trim()];
  const loc = locationName.trim();
  const sched = schedule.trim();
  if (loc) parts.push(loc);
  if (sched) parts.push(sched);
  return parts.join(GROUP_NAME_SEP);
}

/**
 * Przebudowuje nazwę po zmianie poziomu lub lokalizacji,
 * zachowując dzień/godzinę z dotychczasowej nazwy (tylko gdy była w formacie z poziomem).
 */
export function rebuildGroupName(options: {
  previousName: string;
  levelCode: string;
  locationName: string;
}): string {
  const parsed = parseGroupName(options.previousName);
  const schedule = parsed.levelCode ? parsed.schedule : '';
  return composeGroupName(options.levelCode, options.locationName, schedule);
}
