import { NextRequest, NextResponse } from "next/server";
import { getDbShape, getRegistrationSchoolId, queryDb } from "@/lib/db";
import { sendSignedContractEmail } from "@/lib/email";
import { getTokenFromRequest } from "@/lib/auth";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

function extractIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const reqLike = request as unknown as { connection?: { remoteAddress?: string } };
  return request.headers.get("x-real-ip") ?? reqLike.connection?.remoteAddress ?? "unknown";
}

export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();
  const shape = await getDbShape();

  try {
    const parentRes = await queryDb<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const parent = parentRes.rows[0];
    if (!parent) return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });

    const contractRes = await queryDb<{
      id: string;
      content_html: string;
      child_id: string | null;
    }>(
      `SELECT id, content_html, child_id
       FROM contracts
       WHERE parent_id = $1 AND school_id = $2 AND status = 'SENT'
       ORDER BY created_at DESC
       LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const contract = contractRes.rows[0];
    if (!contract) return NextResponse.json({ message: "Brak umowy do podpisu" }, { status: 400 });

    const ip = extractIp(request);
    await queryDb(
      `UPDATE contracts
       SET status = 'SIGNED', signed_at = NOW(), signed_ip = $2
       WHERE id = $1`,
      [contract.id, ip]
    );

    if (contract.child_id) {
      if (shape.childHasConfirmed) {
        await queryDb(
          `UPDATE children
           SET confirmed = TRUE
           WHERE id = $1 AND parent_id = $2 AND school_id = $3`,
          [contract.child_id, parentId, SCHOOL_ID]
        );
      }
      if (shape.childHasAccessLevel) {
        await queryDb(
          `UPDATE children
           SET access_level = 'SIGNED'
           WHERE id = $1 AND parent_id = $2 AND school_id = $3`,
          [contract.child_id, parentId, SCHOOL_ID]
        );
      }
      if (shape.childHasEnrollmentRequestId) {
        const erRes = await queryDb<{ enrollment_request_id: string | null }>(
          `SELECT enrollment_request_id FROM children WHERE id = $1 LIMIT 1`,
          [contract.child_id]
        );
        const enrollmentRequestId = erRes.rows[0]?.enrollment_request_id ?? null;
        if (enrollmentRequestId) {
          await queryDb(
            `UPDATE enrollment_requests
             SET status = 'SIGNED', contract_signed = TRUE, contract_signed_at = NOW()
             WHERE id = $1 AND user_id = $2 AND school_id = $3`,
            [enrollmentRequestId, parentId, SCHOOL_ID]
          );
          await syncChildrenAccessLevelForEnrollment(enrollmentRequestId, "SIGNED");
        }
      }
    } else {
      await queryDb(
        `UPDATE children
         SET confirmed = TRUE
         WHERE parent_id = $1 AND school_id = $2`,
        [parentId, SCHOOL_ID]
      );
      await queryDb(
        `UPDATE enrollment_requests
         SET status = 'SIGNED', contract_signed = TRUE, contract_signed_at = NOW()
         WHERE user_id = $1 AND school_id = $2 AND status IN ('ACCEPTED', 'PROPOSED')`,
        [parentId, SCHOOL_ID]
      );
      if (shape.childHasAccessLevel) {
        await queryDb(
          `UPDATE children
           SET access_level = 'SIGNED'
           WHERE parent_id = $1 AND school_id = $2 AND active = TRUE`,
          [parentId, SCHOOL_ID]
        );
      }
    }

    await syncParentUserAccessLevel(parentId);

    await sendSignedContractEmail(parent.email, contract.content_html);

    return NextResponse.json({
      message: "Umowa podpisana",
      accessLevel: "ACTIVE",
    });
  } catch (error) {
    console.error("Enrollment sign error:", error);
    return NextResponse.json({ message: "Nie udało się podpisać umowy" }, { status: 500 });
  }
}
