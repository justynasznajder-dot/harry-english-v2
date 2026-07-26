import { generateComplimentaryPickupConsentIfNeeded } from "@/lib/complimentary-pickup-consent";
import { queryDb } from "@/lib/db";
import {
  enrollChildrenForEnrollmentRequest,
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

/**
 * Kończy zapis po akceptacji grupy — bez umowy i bez zgody na wizerunek (tryb bez opłat).
 * Jeśli grupa wymaga zgody na odbiór przez lektora — generuje PDF zgody (nie załącznik).
 */
export async function completeComplimentaryEnrollment(
  enrollmentRequestId: string,
  parentId: string,
  schoolId: string
): Promise<{
  pickupConsentGenerated: boolean;
  pickupConsentPreviewHtml?: string;
  pickupConsentChildName?: string;
  pickupConsentDownloadKey?: string | null;
}> {
  // Najpierw dokument (przed COMPLETED), żeby przy błędzie rodzic mógł ponowić akceptację.
  const pickup = await generateComplimentaryPickupConsentIfNeeded({
    enrollmentRequestId,
    parentId,
    schoolId,
  });

  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'COMPLETED',
         accepted_at = COALESCE(accepted_at, NOW())
     WHERE id = $1
       AND school_id = $2`,
    [enrollmentRequestId, schoolId]
  );

  await syncChildrenAccessLevelForEnrollment(enrollmentRequestId, "COMPLETED");

  await queryDb(
    `UPDATE children
     SET confirmed = TRUE,
         access_level = 'COMPLETED'
     WHERE enrollment_request_id = $1
       AND parent_id = $2
       AND school_id = $3`,
    [enrollmentRequestId, parentId, schoolId]
  );

  await enrollChildrenForEnrollmentRequest(enrollmentRequestId);
  await syncParentUserAccessLevel(parentId);

  return {
    pickupConsentGenerated: pickup.generated,
    pickupConsentPreviewHtml: pickup.previewHtml,
    pickupConsentChildName: pickup.childName,
    pickupConsentDownloadKey: pickup.downloadKey ?? null,
  };
}
