import { queryDb, type ResolvedAdminPanelTenant } from "@/lib/db";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

/** Statusy, w których manager może oznaczyć rezygnację rodzica (przed podpisem / zakończeniem). */
const PARENT_RESIGNATION_ALLOWED_STATUSES = new Set([
  "NEW",
  "PROPOSED",
  "NEGOTIATING",
  "ACCEPTED",
  "AWAITING_CONTRACT",
  "CONTRACT_READY",
]);

export async function rejectEnrollmentParentResignation(
  tenant: ResolvedAdminPanelTenant,
  requestId: string,
  rejectionComment?: string | null
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const comment =
    typeof rejectionComment === "string" ? rejectionComment.trim().slice(0, 2000) : "";
  if (!comment) {
    return {
      ok: false,
      status: 400,
      message: "Podaj powód rezygnacji rodzica.",
    };
  }

  const res =
    tenant.role === "MANAGER"
      ? await queryDb<{
          id: string;
          status: string;
          user_id: string | null;
          school_id: string;
          proposed_group_id: string | null;
        }>(
          `SELECT id, status::text AS status, user_id, school_id, proposed_group_id
           FROM enrollment_requests
           WHERE id = $1 AND school_id = $2
           LIMIT 1`,
          [requestId, tenant.tenantSchoolId]
        )
      : await queryDb<{
          id: string;
          status: string;
          user_id: string | null;
          school_id: string;
          proposed_group_id: string | null;
        }>(
          `SELECT id, status::text AS status, user_id, school_id, proposed_group_id
           FROM enrollment_requests
           WHERE id = $1
           LIMIT 1`,
          [requestId]
        );

  const row = res.rows[0];
  if (!row) {
    return { ok: false, status: 404, message: "Nie znaleziono zgłoszenia" };
  }

  const status = String(row.status).trim().toUpperCase();
  if (!PARENT_RESIGNATION_ALLOWED_STATUSES.has(status)) {
    return {
      ok: false,
      status: 409,
      message:
        status === "SIGNED" || status === "COMPLETED"
          ? "Nie można oznaczyć rezygnacji — zapis jest już zakończony / umowa podpisana."
          : status === "REJECTED"
            ? "Zgłoszenie jest już oznaczone jako odrzucone."
            : "Rezygnacji rodzica nie można oznaczyć w tym statusie zgłoszenia.",
    };
  }

  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'REJECTED',
         rejected_at = NOW(),
         rejection_comment = $2
     WHERE id = $1`,
    [requestId, comment]
  );

  await syncChildrenAccessLevelForEnrollment(requestId, "REJECTED");

  // Wyjdź z aktywnych grup + dezaktywuj profil dziecka.
  const childrenRes = await queryDb<{ id: string }>(
    `SELECT id FROM children WHERE enrollment_request_id = $1`,
    [requestId]
  );
  for (const child of childrenRes.rows) {
    await queryDb(
      `UPDATE group_students
       SET left_at = NOW()
       WHERE child_id = $1
         AND left_at IS NULL`,
      [child.id]
    );
  }

  await queryDb(
    `UPDATE children
     SET active = FALSE,
         confirmed = FALSE
     WHERE enrollment_request_id = $1`,
    [requestId]
  );

  if (row.user_id) {
    await syncParentUserAccessLevel(row.user_id);
  }

  return { ok: true };
}
