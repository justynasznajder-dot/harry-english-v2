import { queryDb } from "@/lib/db";
import { isEnrollmentContractPipelineStatus } from "@/lib/enrollment-status";

const PENDING_STATUSES = new Set(["NEW", "PROPOSED", "NEGOTIATING"]);
const RESOLVED_STATUSES = new Set([
  "ACCEPTED",
  "AWAITING_CONTRACT",
  "CONTRACT_READY",
  "REJECTED",
  "SIGNED",
]);

export type EnrollmentContractReadiness = {
  hasPendingDecisions: boolean;
  allDecisionsResolved: boolean;
  acceptedCount: number;
  rejectedCount: number;
  /** Wszystkie decyzje rozstrzygnięte i jest ≥1 dziecko w pipeline umowy — można uzupełnić / potwierdzić dane. */
  canPrepareContract: boolean;
  /** Jest ≥1 dziecko ACCEPTED gotowe do oznaczenia jako oczekujące na umowę ze szkoły. */
  canSubmitContractData: boolean;
  awaitingContractCount: number;
};

export function computeEnrollmentContractReadiness(
  enrollmentStatuses: string[],
  complimentaryEnrollment: boolean
): EnrollmentContractReadiness {
  const normalized = enrollmentStatuses.map((s) => String(s).trim().toUpperCase()).filter(Boolean);

  const hasPendingDecisions = normalized.some((s) => PENDING_STATUSES.has(s));
  const allDecisionsResolved =
    normalized.length > 0 && normalized.every((s) => RESOLVED_STATUSES.has(s));
  const acceptedCount = normalized.filter((s) => isEnrollmentContractPipelineStatus(s)).length;
  const rejectedCount = normalized.filter((s) => s === "REJECTED").length;
  const awaitingContractCount = normalized.filter(
    (s) => s === "AWAITING_CONTRACT" || s === "CONTRACT_READY"
  ).length;
  const hasAcceptedPendingSubmit = normalized.some((s) => s === "ACCEPTED");
  const canPrepareContract =
    !complimentaryEnrollment && allDecisionsResolved && acceptedCount > 0;
  const canSubmitContractData = canPrepareContract && hasAcceptedPendingSubmit;

  return {
    hasPendingDecisions,
    allDecisionsResolved,
    acceptedCount,
    rejectedCount,
    canPrepareContract,
    canSubmitContractData,
    awaitingContractCount,
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
