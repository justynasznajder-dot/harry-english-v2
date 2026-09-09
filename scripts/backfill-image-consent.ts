/**
 * Uzupełnia contract_children.image_consent dla podpisanych umów.
 *
 * Źródło prawdy: po podpisie zgoda → attachment_1_html niepusty;
 * odmowa → attachment_1_html NULL.
 *
 * Użycie:
 *   npx tsx scripts/backfill-image-consent.ts              # dry-run
 *   npx tsx scripts/backfill-image-consent.ts --apply       # zapis do DB
 *   npx tsx scripts/backfill-image-consent.ts --apply --verify-r2
 */
import { Pool } from "pg";
import { loadEnvFiles } from "./load-env";

type Row = {
  contract_id: string;
  child_id: string;
  school_id: string;
  parent_id: string;
  contract_number: string | null;
  child_first_name: string;
  child_last_name: string;
  has_attachment_1: boolean;
  image_consent: boolean | null;
};

function parseFlags() {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has("--apply"),
    verifyR2: args.has("--verify-r2"),
  };
}

function parseFlagsAndLoadEnv() {
  loadEnvFiles();
  return parseFlags();
}

async function main(): Promise<void> {
  const { apply, verifyR2 } = parseFlagsAndLoadEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Brak DATABASE_URL.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const res = await pool.query<Row>(
      `SELECT
         cc.contract_id,
         cc.child_id,
         cc.school_id,
         c.parent_id,
         c.contract_number,
         ch.first_name AS child_first_name,
         ch.last_name AS child_last_name,
         (
           cc.attachment_1_html IS NOT NULL
           AND BTRIM(cc.attachment_1_html) <> ''
         ) AS has_attachment_1,
         cc.image_consent
       FROM contract_children cc
       JOIN contracts c ON c.id = cc.contract_id
       JOIN children ch ON ch.id = cc.child_id
       WHERE c.status = 'SIGNED'
       ORDER BY c.signed_at NULLS LAST, cc.contract_id, cc.sort_order`
    );

    if (res.rows.length === 0) {
      console.log("Brak wierszy contract_children dla podpisanych umów.");
      return;
    }

    let toTrue = 0;
    let toFalse = 0;
    let unchanged = 0;
    const updates: Array<{ contract_id: string; child_id: string; value: boolean }> = [];

    for (const row of res.rows) {
      const next = row.has_attachment_1;
      if (row.image_consent === next) {
        unchanged += 1;
        continue;
      }
      if (next) toTrue += 1;
      else toFalse += 1;
      updates.push({
        contract_id: row.contract_id,
        child_id: row.child_id,
        value: next,
      });
    }

    console.log(
      [
        `Podpisane dzieci w umowach: ${res.rows.length}`,
        `Do ustawienia true: ${toTrue}`,
        `Do ustawienia false: ${toFalse}`,
        `Bez zmian: ${unchanged}`,
        apply ? "TRYB: apply" : "TRYB: dry-run (dodaj --apply aby zapisać)",
      ].join("\n")
    );

    if (apply && updates.length > 0) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const u of updates) {
          await client.query(
            `UPDATE contract_children
             SET image_consent = $3
             WHERE contract_id = $1 AND child_id = $2`,
            [u.contract_id, u.child_id, u.value]
          );
        }
        await client.query("COMMIT");
        console.log(`Zapisano ${updates.length} wierszy.`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    if (!verifyR2) return;

    // Dynamic import — dopiero po loadEnvFiles (r2-usage → db wymaga DATABASE_URL).
    const { formatPersonName } = await import("@/lib/format-person-name");
    const { isImageConsentPdfFilename } = await import("@/lib/image-consent-notice");
    const { listSignedContractPdfsForParent, runWithR2Source } = await import(
      "@/lib/r2-storage"
    );

    const childNameKey = (first: string, last: string) =>
      `${formatPersonName(first)} ${formatPersonName(last)}`
        .trim()
        .toLocaleLowerCase("pl");

    const filenameLooksLikeChild = (filename: string, childName: string) => {
      const base = (filename.split(/[/\\]/).pop() ?? filename).toLocaleLowerCase("pl");
      const name = childName.trim().toLocaleLowerCase("pl");
      if (!name) return false;
      return base.includes(name);
    };

    console.log("\nWeryfikacja krzyżowa R2 (lista PDF wizerunku vs wartość z HTML)…");
    const byParent = new Map<string, Row[]>();
    for (const row of res.rows) {
      const key = `${row.school_id}::${row.parent_id}`;
      const list = byParent.get(key) ?? [];
      list.push(row);
      byParent.set(key, list);
    }

    let r2Matches = 0;
    let r2Mismatches = 0;
    let r2Skipped = 0;

    await runWithR2Source("script.backfill-contracts", async () => {
      for (const [, rows] of byParent) {
        const sample = rows[0]!;
        let files: Awaited<ReturnType<typeof listSignedContractPdfsForParent>> = [];
        try {
          files = await listSignedContractPdfsForParent({
            parentUserId: sample.parent_id,
            schoolId: sample.school_id,
            source: "script.backfill-contracts",
          });
        } catch (e) {
          console.warn(
            `R2 list failed parent=${sample.parent_id}:`,
            e instanceof Error ? e.message : e
          );
          r2Skipped += rows.length;
          continue;
        }

        const imageFiles = files.filter((f) => isImageConsentPdfFilename(f.filename));

        for (const row of rows) {
          const expectedFromHtml = row.has_attachment_1;
          const childName = childNameKey(row.child_first_name, row.child_last_name);
          const hasPdfForChild = imageFiles.some((f) =>
            filenameLooksLikeChild(f.filename, childName)
          );

          if (expectedFromHtml === hasPdfForChild) {
            r2Matches += 1;
            continue;
          }

          r2Mismatches += 1;
          console.warn(
            [
              "R2 mismatch:",
              `contract=${row.contract_id}`,
              `child=${childName}`,
              `html=${expectedFromHtml}`,
              `r2_pdf=${hasPdfForChild}`,
              row.contract_number ? `nr=${row.contract_number}` : "",
            ]
              .filter(Boolean)
              .join(" ")
          );
        }
      }
    });

    console.log(
      `\nR2: zgodne=${r2Matches}, rozjazdy=${r2Mismatches}, pominięte=${r2Skipped}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
