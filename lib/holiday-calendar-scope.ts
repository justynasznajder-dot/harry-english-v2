import {
  classifyLocationForGroupLevel,
  detectLevelFromGroupName,
  getHarryEnglishLevelStage,
} from "@/src/data/harryEnglishLevels";

export type HolidayFacilityKind = "preschool" | "school" | "unknown";

/** Zakres dnia wolnego względem placówek. */
export type HolidayCalendarScope = "all" | "preschool" | "school" | "mixed";

export function classifyGroupFacilityKindForHoliday(group: {
  level: string | null;
  name: string;
  location_id: string | null;
  location_facility?: string | null;
  location_name?: string | null;
  location_is_special?: boolean | null;
}): HolidayFacilityKind {
  if (group.location_id) {
    const kind = classifyLocationForGroupLevel({
      facility: group.location_facility,
      name: group.location_name,
      is_special: group.location_is_special,
    });
    if (kind === "preschool") return "preschool";
    if (kind === "school" || kind === "special") return "school";
  }
  const level =
    (group.level && String(group.level).trim()) ||
    detectLevelFromGroupName(group.name) ||
    "";
  const stage = getHarryEnglishLevelStage(level);
  if (stage === "preschool") return "preschool";
  if (stage === "school" || stage === "exam") return "school";
  return "unknown";
}

/**
 * - PUBLIC / brak group_ids / obie placówki → all (szare)
 * - tylko przedszkola / tylko szkoły → partial (żółte)
 * - niejednoznaczne → mixed (żółte)
 */
export function resolveHolidayCalendarScope(opts: {
  type: string;
  groupIds: string[];
  groupKinds: HolidayFacilityKind[];
}): HolidayCalendarScope {
  if (String(opts.type).toUpperCase() === "PUBLIC") return "all";
  if (!opts.groupIds.length) return "all";

  const kinds = new Set(
    opts.groupKinds.filter((k): k is "preschool" | "school" => k === "preschool" || k === "school"),
  );
  if (kinds.size === 0) return "mixed";
  if (kinds.has("preschool") && kinds.has("school")) return "all";
  if (kinds.has("preschool")) return "preschool";
  return "school";
}

export function holidayAudienceLabel(scope: HolidayCalendarScope): string | null {
  switch (scope) {
    case "preschool":
      return "Przedszkola";
    case "school":
      return "Szkoły";
    case "mixed":
      return "Wybrane grupy";
    default:
      return null;
  }
}

/**
 * Etykieta „Dotyczy: …” na liście dni wolnych w panelu admina.
 * Porównuje wybrane grupy z aktywnymi grupami szkoły (przedszkole / szkoła).
 */
export function formatHolidayAppliesToLabel(opts: {
  appliesToAllGroups: boolean;
  groupIds: string[];
  activeGroups: Array<{ id: string; facilityKind: HolidayFacilityKind }>;
}): string {
  const groupIds = (opts.groupIds ?? []).filter(Boolean);
  if (opts.appliesToAllGroups || groupIds.length === 0) {
    return "Dotyczy: wszyscy";
  }

  const selected = new Set(groupIds);
  const schoolGroups = opts.activeGroups.filter((g) => g.facilityKind === "school");
  const preschoolGroups = opts.activeGroups.filter((g) => g.facilityKind === "preschool");

  const selectedSchoolCount = schoolGroups.filter((g) => selected.has(g.id)).length;
  const selectedPreschoolCount = preschoolGroups.filter((g) => selected.has(g.id)).length;
  const hasSchool = selectedSchoolCount > 0;
  const hasPreschool = selectedPreschoolCount > 0;
  const allSchools =
    schoolGroups.length > 0 && selectedSchoolCount === schoolGroups.length;
  const allPreschools =
    preschoolGroups.length > 0 && selectedPreschoolCount === preschoolGroups.length;

  const knownIds = new Set(
    [...schoolGroups, ...preschoolGroups].map((g) => g.id),
  );
  const onlyKnownSelected = groupIds.every((id) => knownIds.has(id));

  if (onlyKnownSelected && allSchools && allPreschools) {
    return "Dotyczy: wszyscy";
  }
  if (onlyKnownSelected && allSchools && !hasPreschool) {
    return "Dotyczy: Wszystkie grupy Szkolne";
  }
  if (onlyKnownSelected && allPreschools && !hasSchool) {
    return "Dotyczy: Wszystkie grupy przedszkolne";
  }

  if (hasSchool && hasPreschool) {
    return "Dotyczy: wybrane grupy szkolne/przedszkolne";
  }
  if (hasSchool) {
    return allSchools
      ? "Dotyczy: Wszystkie grupy Szkolne"
      : "Dotyczy: wybrane grupy szkolne";
  }
  if (hasPreschool) {
    return allPreschools
      ? "Dotyczy: Wszystkie grupy przedszkolne"
      : "Dotyczy: wybrane grupy przedszkolne";
  }
  return "Dotyczy: wybrane grupy";
}

export function isFullHolidayScope(scope: HolidayCalendarScope): boolean {
  return scope === "all";
}
