import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { queryDb } from "@/lib/db";

const SEASON_RE = /^\d{4}\/\d{4}$/;

/** Walidacja etykiety rundy, np. "2025/2026" (drugi rok = pierwszy + 1). */
export function validateRenewalSeason(season: string): boolean {
  const trimmed = season.trim();
  if (!SEASON_RE.test(trimmed)) return false;
  const [start, end] = trimmed.split("/").map((y) => Number(y));
  return Number.isFinite(start) && Number.isFinite(end) && end === start + 1;
}

/** Aktualizuje `children.access_level` dla odnowienia (po `child_id`). */
export async function syncChildAccessLevelForRenewal(
  childId: string,
  accessLevel: EnrollmentStatus
): Promise<void> {
  await queryDb(`UPDATE children SET access_level = $2 WHERE id = $1`, [childId, accessLevel]);
}
