import { Pool } from "pg";
import { buildSignedContractPdfFiles } from "@/lib/contract-pdf";
import { formatPersonName } from "@/lib/format-person-name";
import { storeSignedContractPdfsInR2 } from "@/lib/r2-storage";
import { loadEnvFiles } from "./load-env";

type SignedContractRow = {
  id: string;
  school_id: string;
  parent_id: string;
  content_html: string;
  signed_at: Date;
  first_name: string;
  last_name: string;
  school_year_name: string | null;
};

type ChildAttachmentRow = {
  first_name: string;
  last_name: string;
  attachment_1_html: string | null;
  attachment_2_html: string | null;
};

async function main(): Promise<void> {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Brak DATABASE_URL.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const res = await pool.query<SignedContractRow>(
      `SELECT
         c.id,
         c.school_id,
         c.parent_id,
         c.content_html,
         c.signed_at,
         u.first_name,
         u.last_name,
         sy.name AS school_year_name
       FROM contracts c
       JOIN users u ON u.id = c.parent_id
       LEFT JOIN school_years sy ON sy.id = c.school_year_id
       WHERE c.status = 'SIGNED'
         AND c.signed_at IS NOT NULL
         AND c.content_html IS NOT NULL
       ORDER BY c.signed_at ASC`
    );

    if (res.rows.length === 0) {
      console.log("Brak podpisanych umów do uzupełnienia.");
      return;
    }

    console.log(`Znaleziono ${res.rows.length} podpisanych umów.`);

    for (const row of res.rows) {
      const parentFullName =
        `${formatPersonName(row.first_name ?? "")} ${formatPersonName(row.last_name ?? "")}`.trim();

      console.log(`\nUmowa ${row.id} — ${parentFullName} (${row.signed_at.toISOString()})`);

      const childrenRes = await pool.query<ChildAttachmentRow>(
        `SELECT c.first_name, c.last_name, cc.attachment_1_html, cc.attachment_2_html
         FROM contract_children cc
         JOIN children c ON c.id = cc.child_id
         WHERE cc.contract_id = $1
         ORDER BY cc.sort_order ASC`,
        [row.id]
      );

      const pdfFiles = await buildSignedContractPdfFiles({
        contentHtml: row.content_html,
        childAttachments: childrenRes.rows.map((child) => ({
          childName:
            `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim(),
          attachment1Html: child.attachment_1_html,
          attachment2Html: child.attachment_2_html,
        })),
      });

      const schoolYearName =
        row.school_year_name?.trim() ||
        String(row.signed_at.getFullYear());

      const keys = await storeSignedContractPdfsInR2({
        parentUserId: row.parent_id,
        schoolId: row.school_id,
        schoolYearName,
        signedAt: row.signed_at,
        pdfFiles,
        source: "script.backfill-contracts",
      });

      console.log(`  → ${keys.length} plik(ów): ${keys.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Backfill R2 failed:", err);
  process.exit(1);
});
