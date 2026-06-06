import { queryDb } from "@/lib/db";

const PENDING_STATUSES = new Set(["NEW", "PROPOSED", "NEGOTIATING"]);
const RESOLVED_STATUSES = new Set(["ACCEPTED", "REJECTED", "SIGNED"]);

export type EnrollmentContractReadiness = {
  hasPendingDecisions: boolean;
  allDecisionsResolved: boolean;
  acceptedCount: number;
  rejectedCount: number;
  canPrepareContract: boolean;
};

export function computeEnrollmentContractReadiness(
  enrollmentStatuses: string[],
  complimentaryEnrollment: boolean
): EnrollmentContractReadiness {
  const normalized = enrollmentStatuses.map((s) => String(s).trim().toUpperCase()).filter(Boolean);

  const hasPendingDecisions = normalized.some((s) => PENDING_STATUSES.has(s));
  const allDecisionsResolved =
    normalized.length > 0 && normalized.every((s) => RESOLVED_STATUSES.has(s));
  const acceptedCount = normalized.filter((s) => s === "ACCEPTED" || s === "SIGNED").length;
  const rejectedCount = normalized.filter((s) => s === "REJECTED").length;
  const canPrepareContract =
    !complimentaryEnrollment && allDecisionsResolved && acceptedCount > 0;

  return {
    hasPendingDecisions,
    allDecisionsResolved,
    acceptedCount,
    rejectedCount,
    canPrepareContract,
  };
}

export async function fetchParentEnrollmentPipelineStatuses(
  schoolId: string,
  parentId: string,
  parentEmail: string
): Promise<string[]> {
  const res = await queryDb<{ status: string }>(
    `SELECT UPPER(BTRIM(COALESCE(er.status::text, 'NEW'))) AS status
     FROM enrollment_requests er
     WHERE er.school_id = $1
       AND (
         er.user_id = $2
         OR ($3 <> '' AND LOWER(BTRIM(er.parent_email::text)) = $3)
       )
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) <> 'COMPLETED'`,
    [schoolId, parentId, parentEmail.trim().toLowerCase()]
  );
  return res.rows.map((row) => row.status);
}
