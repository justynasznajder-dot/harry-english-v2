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

/** Sufiks równoległej grupy: ` (2)`, ` (3)`, … — bez `(1)` na pierwszej. */
const GROUP_NAME_NUMERIC_SUFFIX_RE = / \((\d+)\)$/;

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

export function getHarryEnglishLevelStage(
  level: string | null | undefined
): HarryEnglishLevel['stage'] | null {
  const code = normalizeHarryEnglishLevel(level);
  if (!code) return null;
  return HARRY_ENGLISH_LEVELS.find((l) => l.code === code)?.stage ?? null;
}

/** Klasyfikacja lokalizacji po facility/nazwie (i fladze special). */
export function classifyLocationForGroupLevel(loc: {
  facility?: string | null;
  name?: string | null;
  is_special?: boolean | null;
}): 'preschool' | 'school' | 'special' | 'unknown' {
  if (loc.is_special) return 'special';
  const hay = `${loc.facility ?? ''} ${loc.name ?? ''}`.toLowerCase();
  if (hay.includes('przedszkol')) return 'preschool';
  if (hay.includes('szkoł') || hay.includes('szkol')) return 'school';
  return 'unknown';
}

/** Lokalizacje pasujące do poziomu: P* → przedszkole, Sz* → szkoła (+ special dla egzaminu). */
export function locationMatchesGroupLevel(
  loc: {
    facility?: string | null;
    name?: string | null;
    is_special?: boolean | null;
  },
  level: string | null | undefined
): boolean {
  const stage = getHarryEnglishLevelStage(level);
  if (!stage) return false;
  const kind = classifyLocationForGroupLevel(loc);
  if (stage === 'preschool') return kind === 'preschool';
  if (stage === 'exam') return kind === 'school' || kind === 'special';
  return kind === 'school';
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
  /** Dzień/godzina i ewentualny sufiks (legacy) albo pusty */
  schedule: string;
};

export function parseGroupName(name: string): ParsedGroupName {
  const withoutNumeric = stripGroupNameNumericSuffix(name);
  const parts = withoutNumeric
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

/** Bazowa nazwa: `P4 · Mokotów` (bez numeru równoległego). */
export function buildGroupNameBase(levelCode: string, locationName: string): string {
  const level = levelCode.trim();
  const loc = locationName.trim();
  if (!level || !loc) return '';
  return `${level}${GROUP_NAME_SEP}${loc}`;
}

export function stripGroupNameNumericSuffix(name: string): string {
  return name.trim().replace(GROUP_NAME_NUMERIC_SUFFIX_RE, '');
}

/**
 * Pierwsza wolna nazwa wśród aktywnych: baza, potem ` (2)`, ` (3)`, …
 * Nie dodaje `(1)` do pierwszej grupy.
 */
export function allocateUniqueGroupName(
  baseName: string,
  existingActiveNames: readonly string[]
): string {
  const base = baseName.trim();
  if (!base) return '';
  const taken = new Set(
    existingActiveNames.map((n) => n.trim()).filter((n) => n.length > 0)
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

export function composeGroupName(
  levelCode: string,
  locationName: string,
  schedule: string = ''
): string {
  const parts: string[] = [levelCode.trim()];
  const loc = locationName.trim();
  const sched = schedule.trim();
  if (loc) parts.push(loc);
  if (sched) parts.push(sched);
  return parts.join(GROUP_NAME_SEP);
}

/**
 * Przebudowuje nazwę po zmianie poziomu lub lokalizacji (szablon bez dnia/godziny).
 * Legacy: zachowuje środkowe segmenty tylko gdy były w starej nazwie — obecnie UI ich nie używa.
 */
export function rebuildGroupName(options: {
  previousName: string;
  levelCode: string;
  locationName: string;
}): string {
  return buildGroupNameBase(options.levelCode, options.locationName);
}
