import { NextRequest, NextResponse } from "next/server";

import { getParentProfileByUserId, getRegistrationSchoolId, queryDb } from "@/lib/db";

import { sendSignedContractConfirmationEmails } from "@/lib/email";

import { getTokenFromRequest } from "@/lib/auth";

import {

  applyContractSignaturesToDocumentHtml,

  applySchoolYearToDocumentHtml,

  extractContractNumber,

} from "@/lib/contract-html";

import { buildSignedContractPdfFiles } from "@/lib/contract-pdf";

import { formatPersonName } from "@/lib/format-person-name";

import { enrollChildInGroup, syncParentUserAccessLevel } from "@/lib/enrollment-sync";
import { resolveBillingTypeFromProfile } from "@/lib/parent-contract-profile";
import { storeSignedContractPdfsInR2 } from "@/lib/r2-storage";

/** PDF (Chromium) + R2 + mail — wymaga więcej czasu niż domyślne 10 s na Vercel. */
export const maxDuration = 60;

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



  try {

    const parentRes = await queryDb<{

      email: string;

      first_name: string;

      last_name: string;

    }>(

      `SELECT email, first_name, last_name

       FROM users

       WHERE id = $1 AND school_id = $2

       LIMIT 1`,

      [parentId, SCHOOL_ID]

    );

    const parent = parentRes.rows[0];

    if (!parent) return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });



    const contractRes = await queryDb<{

      id: string;

      content_html: string;

    }>(

      `SELECT c.id, c.content_html

       FROM contracts c

       WHERE c.parent_id = $1

         AND c.school_id = $2

         AND c.child_id IS NULL

         AND c.status = 'SENT'

       ORDER BY c.created_at DESC

       LIMIT 1`,

      [parentId, SCHOOL_ID]

    );

    const contract = contractRes.rows[0];

    if (!contract) {

      return NextResponse.json({ message: "Brak umowy do podpisu" }, { status: 400 });

    }



    const includedRes = await queryDb<{

      child_id: string;

      enrollment_request_id: string | null;

      group_id: string | null;

      first_name: string;

      last_name: string;

      attachment_1_html: string | null;

      attachment_2_html: string | null;

    }>(

      `SELECT cc.child_id, cc.enrollment_request_id, cc.group_id, ch.first_name, ch.last_name,

              cc.attachment_1_html, cc.attachment_2_html

       FROM contract_children cc

       JOIN children ch ON ch.id = cc.child_id

       WHERE cc.contract_id = $1

       ORDER BY cc.sort_order ASC`,

      [contract.id]

    );

    const included = includedRes.rows;



    const ip = extractIp(request);

    const signedAt = new Date();

    const parentFullName =

      `${formatPersonName(parent.first_name ?? "")} ${formatPersonName(parent.last_name ?? "")}`.trim();

    const childNames = included

      .map(

        (c) =>

          `${formatPersonName(c.first_name)} ${formatPersonName(c.last_name)}`.trim()

      )

      .filter(Boolean);

    const childName =

      childNames.length > 0

        ? childNames.join(", ")

        : null;



    const signedContentHtml = applyContractSignaturesToDocumentHtml(
      applySchoolYearToDocumentHtml(contract.content_html, signedAt),
      {
        signedAt,
        parentFullName,
      }
    );

    const signedChildAttachments: Array<{
      child_id: string;
      childName: string;
      attachment1Html: string | null;
      attachment2Html: string | null;
    }> = [];

    for (const row of included) {
      const signedAttachment1 = row.attachment_1_html
        ? applyContractSignaturesToDocumentHtml(
            applySchoolYearToDocumentHtml(row.attachment_1_html, signedAt),
            { signedAt, parentFullName }
          )
        : null;
      const signedAttachment2 = row.attachment_2_html
        ? applyContractSignaturesToDocumentHtml(
            applySchoolYearToDocumentHtml(row.attachment_2_html, signedAt),
            { signedAt, parentFullName }
          )
        : null;

      if (signedAttachment1 || signedAttachment2) {
        signedChildAttachments.push({
          child_id: row.child_id,
          childName:
            `${formatPersonName(row.first_name)} ${formatPersonName(row.last_name)}`.trim(),
          attachment1Html: signedAttachment1,
          attachment2Html: signedAttachment2,
        });
      }

      if (signedAttachment1 || signedAttachment2) {
        await queryDb(
          `UPDATE contract_children
           SET attachment_1_html = $2, attachment_2_html = $3
           WHERE contract_id = $1 AND child_id = $4`,
          [contract.id, signedAttachment1, signedAttachment2, row.child_id]
        );
      }
    }

    await queryDb(

      `UPDATE contracts

       SET status = 'SIGNED',

           signed_at = NOW(),

           signed_ip = $2,

           content_html = $3

       WHERE id = $1`,

      [contract.id, ip, signedContentHtml]

    );



    for (const row of included) {

      await queryDb(

        `UPDATE children

         SET confirmed = TRUE, access_level = 'SIGNED'

         WHERE id = $1 AND parent_id = $2 AND school_id = $3`,

        [row.child_id, parentId, SCHOOL_ID]

      );

      if (row.enrollment_request_id) {

        await queryDb(

          `UPDATE enrollment_requests

           SET status = 'SIGNED'

           WHERE id = $1 AND user_id = $2 AND school_id = $3`,

          [row.enrollment_request_id, parentId, SCHOOL_ID]

        );

      }

      if (row.group_id) {
        await enrollChildInGroup(row.child_id, row.group_id);
      }

    }



    await syncParentUserAccessLevel(parentId);



    try {
      const pdfFiles = await buildSignedContractPdfFiles({
        contentHtml: signedContentHtml,
        childAttachments: signedChildAttachments,
      });

      const profile = await getParentProfileByUserId(parentId);
      const billingType = resolveBillingTypeFromProfile(profile);
      const parentPesel =
        billingType === "company"
          ? String(profile?.nip ?? "").trim()
          : String(profile?.pesel ?? "").trim();

      try {
        await storeSignedContractPdfsInR2({
          schoolId: SCHOOL_ID,
          parentFullName,
          parentPesel,
          signedAt,
          pdfFiles,
        });
      } catch (r2Err) {
        console.error("Signed contract R2 backup error:", r2Err);
      }

      try {
        await sendSignedContractConfirmationEmails({
          parentEmail: parent.email,
          parentFirstName: formatPersonName(parent.first_name ?? "Rodzicu"),
          parentFullName,
          contractNumber: extractContractNumber(signedContentHtml),
          childName,
          pdfFiles,
        });
      } catch (mailErr) {
        console.error("Signed contract email error:", mailErr);
      }
    } catch (pdfErr) {
      console.error("Signed contract PDF generation error:", pdfErr);
    }



    return NextResponse.json({

      message: "Umowa podpisana",

      accessLevel: "ACTIVE",

    });

  } catch (error) {

    console.error("Enrollment sign error:", error);

    return NextResponse.json({ message: "Nie udało się podpisać umowy" }, { status: 500 });

  }

}


