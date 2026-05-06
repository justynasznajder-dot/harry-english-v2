import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import { sendSignedContractEmail } from "@/lib/email";

function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] ?? null;
  } catch {
    return null;
  }
}

function extractIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const reqLike = request as unknown as { connection?: { remoteAddress?: string } };
  return request.headers.get("x-real-ip") ?? reqLike.connection?.remoteAddress ?? "unknown";
}

export async function POST(request: NextRequest) {
  const parentId = getUserIdFromRequest(request);
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  try {
    const parentRes = await queryDb<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const parent = parentRes.rows[0];
    if (!parent) return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });

    const contractRes = await queryDb<{ id: string; content_html: string }>(
      `SELECT id, content_html
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
    await queryDb(
      `UPDATE users
       SET access_level = 'ACTIVE'
       WHERE id = $1`,
      [parentId]
    );

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
