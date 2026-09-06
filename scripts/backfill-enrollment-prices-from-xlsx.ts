/**
 * Jednorazowy backfill cen w enrollment_requests z pliku Excel.
 *
 * Mapowanie: A=id, AH=lesson, AI=monthly (ratalna), AJ=yearly (jednorazowa).
 *
 * Użycie:
 *   npx tsx scripts/backfill-enrollment-prices-from-xlsx.ts           # dry-run
 *   $env:CONFIRM="1"; npx tsx scripts/backfill-enrollment-prices-from-xlsx.ts
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

type PriceRow = {
  id: string;
  lesson: number;
  monthly: number;
  yearly: number;
  row: number;
};

const PAYLOAD_PATH = path.join(__dirname, "_ceny_payload.json");
const CONFIRM = process.env.CONFIRM === "1";

async function main() {
  if (!fs.existsSync(PAYLOAD_PATH)) {
    throw new Error(`Brak payloadu: ${PAYLOAD_PATH}`);
  }
  const rows = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8")) as PriceRow[];
  const ids = rows.map((r) => r.id);

  const { queryDb, runPgTransaction } = await import("../lib/db");

  const res = await queryDb<{
    id: string;
    school_id: string;
    status: string;
    lesson_unit_price: string | null;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
  }>(
    `SELECT id,
            school_id,
            UPPER(BTRIM(COALESCE(status::text, ''))) AS status,
            lesson_unit_price::text,
            monthly_unit_price::text,
            yearly_unit_price::text
     FROM enrollment_requests
     WHERE id = ANY($1::text[])`,
    [ids]
  );

  const found = new Map(res.rows.map((r) => [r.id, r]));
  let missing = 0;
  let alreadyAny = 0;
  let allNull = 0;
  const bySchool: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const missingIds: string[] = [];

  for (const r of rows) {
    const db = found.get(r.id);
    if (!db) {
      missing += 1;
      missingIds.push(r.id);
      continue;
    }
    bySchool[db.school_id] = (bySchool[db.school_id] || 0) + 1;
    byStatus[db.status] = (byStatus[db.status] || 0) + 1;
    const has =
      db.lesson_unit_price != null ||
      db.monthly_unit_price != null ||
      db.yearly_unit_price != null;
    if (has) alreadyAny += 1;
    else allNull += 1;
  }

  const alreadyRows = rows
    .map((r) => {
      const db = found.get(r.id);
      if (!db) return null;
      const has =
        db.lesson_unit_price != null ||
        db.monthly_unit_price != null ||
        db.yearly_unit_price != null;
      if (!has) return null;
      return {
        id: r.id,
        db: {
          lesson: db.lesson_unit_price,
          monthly: db.monthly_unit_price,
          yearly: db.yearly_unit_price,
        },
        excel: { lesson: r.lesson, monthly: r.monthly, yearly: r.yearly },
      };
    })
    .filter(Boolean);

  console.log(
    JSON.stringify(
      {
        mode: CONFIRM ? "APPLY" : "DRY_RUN",
        excelRows: rows.length,
        foundInDb: found.size,
        missingInDb: missing,
        alreadyHaveAnyPrice: alreadyAny,
        allPricesNull: allNull,
        bySchool,
        byStatus,
        missingSample: missingIds.slice(0, 10),
        alreadyHavePricesDetail: alreadyRows,
      },
      null,
      2
    )
  );

  if (!CONFIRM) {
    console.log('Dry-run OK. Aby zapisać: $env:CONFIRM="1"; npx tsx scripts/backfill-enrollment-prices-from-xlsx.ts');
    return;
  }

  let updated = 0;
  let skippedExisting = 0;
  await runPgTransaction(async (client) => {
    for (const r of rows) {
      const db = found.get(r.id);
      if (!db) continue;
      const hasExisting =
        db.lesson_unit_price != null ||
        db.monthly_unit_price != null ||
        db.yearly_unit_price != null;
      if (hasExisting) {
        skippedExisting += 1;
        continue;
      }
      const q = await client.query(
        `UPDATE enrollment_requests
         SET lesson_unit_price = $2,
             monthly_unit_price = $3,
             yearly_unit_price = $4
         WHERE id = $1
           AND lesson_unit_price IS NULL
           AND monthly_unit_price IS NULL
           AND yearly_unit_price IS NULL`,
        [r.id, r.lesson, r.monthly, r.yearly]
      );
      updated += q.rowCount ?? 0;
    }
  });
  console.log(JSON.stringify({ skippedExisting }, null, 2));

  const after = await queryDb<{
    with_all_three: string;
  }>(
    `SELECT COUNT(*)::text AS with_all_three
     FROM enrollment_requests
     WHERE id = ANY($1::text[])
       AND lesson_unit_price IS NOT NULL
       AND monthly_unit_price IS NOT NULL
       AND yearly_unit_price IS NOT NULL`,
    [ids]
  );

  console.log(
    JSON.stringify(
      {
        updatedRows: updated,
        withAllThreePrices: after.rows[0]?.with_all_three,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
