import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { queryDb } from "@/lib/db";

export { validateRenewalSeason, suggestRenewalSeason } from "@/lib/renewal-season";

/** Aktualizuje `children.access_level` dla odnowienia (po `child_id`). */
export async function syncChildAccessLevelForRenewal(
  childId: string,
  accessLevel: EnrollmentStatus
): Promise<void> {
  await queryDb(`UPDATE children SET access_level = $2 WHERE id = $1`, [childId, accessLevel]);
}
