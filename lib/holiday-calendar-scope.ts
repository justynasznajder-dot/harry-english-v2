import { queryDb } from "@/lib/db";
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

export function isFullHolidayScope(scope: HolidayCalendarScope): boolean {
  return scope === "all";
}

/**
 * Rozszerza wybrane grupy o wszystkie aktywne grupy szkoły o tych samych
 * rodzajach placówki (przedszkole / szkoła). Dzięki temu „dzień wolny dla szkół”
 * obejmuje też grupy pominięte w UI (np. nowo dodane).
 */
export async function expandHolidayGroupIdsByFacilityKinds(
  schoolId: string,
  selectedGroupIds: string[],
): Promise<string[]> {
  const selected = [
    ...new Set(selectedGroupIds.filter((id) => typeof id === "string" && id.trim())),
  ];
  if (selected.length === 0) return [];

  const groupsRes = await queryDb<{
    id: string;
    name: string;
    level: string | null;
    location_id: string | null;
    location_facility: string | null;
    location_name: string | null;
    location_is_special: boolean | null;
  }>(
    `SELECT g.id, g.name, g.level, g.location_id,
            loc.facility AS location_facility,
            loc.name AS location_name,
            loc.is_special AS location_is_special
     FROM groups g
     LEFT JOIN locations loc ON loc.id = g.location_id
     WHERE g.school_id = $1
       AND g.deleted_at IS NULL
       AND g.active = TRUE`,
    [schoolId],
  );

  const byId = new Map(groupsRes.rows.map((g) => [g.id, g]));
  const kinds = new Set<"preschool" | "school">();
  for (const id of selected) {
    const g = byId.get(id);
    if (!g) continue;
    const kind = classifyGroupFacilityKindForHoliday(g);
    if (kind === "preschool" || kind === "school") kinds.add(kind);
  }
  if (kinds.size === 0) return selected;

  const expanded = groupsRes.rows
    .filter((g) => {
      const kind = classifyGroupFacilityKindForHoliday(g);
      return kind === "preschool" || kind === "school" ? kinds.has(kind) : selected.includes(g.id);
    })
    .map((g) => g.id);

  return [...new Set([...selected, ...expanded])];
}
