/**
 * Wysyłka maila z propozycją zajęć + danymi logowania — szkoły z whitelisty.
 */
export const ENROLLMENT_PROPOSAL_EMAIL_ENABLED_SCHOOL_IDS = new Set([
  "efcb641a-e5bd-4e59-aa39-c08fd1b318e9", // DEV
  "c93d5ac1-fa59-497f-b450-a4e50e1fb50d", // PROD
]);

export function isEnrollmentProposalEmailEnabled(
  schoolId: string | null | undefined
): boolean {
  const id = String(schoolId ?? "")
    .trim()
    .toLowerCase();
  return id.length > 0 && ENROLLMENT_PROPOSAL_EMAIL_ENABLED_SCHOOL_IDS.has(id);
}
