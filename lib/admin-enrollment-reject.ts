import { queryDb, type ResolvedAdminPanelTenant } from "@/lib/db";
import { syncChildrenAccessLevelForEnrollment, syncParentUserAccessLevel } from "@/lib/enrollment-sync";

export async function rejectEnrollmentParentResignation(
  tenant: ResolvedAdminPanelTenant,
  requestId: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const res =
    tenant.role === "MANAGER"
      ? await queryDb<{
          id: string;
          status: string;
          user_id: string | null;
          school_id: string;
        }>(
          `SELECT id, status::text AS status, user_id, school_id
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
        }>(
          `SELECT id, status::text AS status, user_id, school_id
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
  if (status !== "NEGOTIATING") {
    return {
      ok: false,
      status: 409,
      message: "Rezygnację rodzica można oznaczyć tylko dla zgłoszenia w negocjacji terminu.",
    };
  }

  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'REJECTED', rejected_at = NOW()
     WHERE id = $1`,
    [requestId]
  );

  await syncChildrenAccessLevelForEnrollment(requestId, "REJECTED");

  await queryDb(
    `UPDATE children
     SET active = FALSE
     WHERE enrollment_request_id = $1`,
    [requestId]
  );

  if (row.user_id) {
    await syncParentUserAccessLevel(row.user_id);
  }

  return { ok: true };
}
