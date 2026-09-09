import { queryDb } from "@/lib/db";
import { classifyGroupFacilityKindForHoliday } from "@/lib/holiday-calendar-scope";

/**
 * Rozszerza wybrane grupy o wszystkie aktywne grupy szkoły o tych samych
 * rodzajach placówki (przedszkole / szkoła). Dzięki temu „dzień wolny dla szkół”
 * obejmuje też grupy pominięte w UI (np. nowo dodane).
 *
 * Tylko po stronie serwera (używa queryDb / pg).
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
