/**
 * Kasuje dokumenty (contracts / invoices / payments) wyłącznie dla szkoły DEV.
 * Pliki R2 nie są ruszane — usuń je ręcznie.
 *
 * Użycie (PowerShell):
 *   $env:CONFIRM="1"; npx tsx scripts/dev-purge-documents.ts
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const DEV_SCHOOL_ID = "efcb641a-e5bd-4e59-aa39-c08fd1b318e9";

async function main() {
  if (process.env.CONFIRM !== "1") {
    console.error(
      'Odmowa: ustaw CONFIRM=1 (PowerShell: $env:CONFIRM="1"; npx tsx scripts/dev-purge-documents.ts)'
    );
    process.exit(1);
  }

  const { queryDb, runPgTransaction } = await import("../lib/db");

  const school = await queryDb<{ id: string; name: string }>(
    `SELECT id, name FROM schools WHERE id = $1 LIMIT 1`,
    [DEV_SCHOOL_ID]
  );
  if (!school.rows[0]) {
    throw new Error(`Nie znaleziono szkoły DEV ${DEV_SCHOOL_ID}`);
  }
  console.log(`Szkoła: ${school.rows[0].name} (${DEV_SCHOOL_ID})`);

  const countsBefore = await queryDb<{
    contracts: string;
    invoices: string;
    payments: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM contracts WHERE school_id = $1) AS contracts,
       (SELECT COUNT(*)::text FROM invoices WHERE school_id = $1) AS invoices,
       (SELECT COUNT(*)::text FROM payments WHERE school_id = $1) AS payments`,
    [DEV_SCHOOL_ID]
  );
  console.log("Przed:", countsBefore.rows[0]);

  await runPgTransaction(async (client) => {
    await client.query(
      `UPDATE lesson_billing_periods
       SET contract_id = NULL
       WHERE school_id = $1 AND contract_id IS NOT NULL`,
      [DEV_SCHOOL_ID]
    );

    // Korekty najpierw (FK corrects_invoice_id)
    await client.query(
      `DELETE FROM invoices
       WHERE school_id = $1 AND document_type = 'CORRECTIVE'`,
      [DEV_SCHOOL_ID]
    );
    await client.query(`DELETE FROM invoices WHERE school_id = $1`, [DEV_SCHOOL_ID]);
    await client.query(`DELETE FROM payments WHERE school_id = $1`, [DEV_SCHOOL_ID]);

    // contract_children kasuje się CASCADE z contracts
    await client.query(`DELETE FROM contracts WHERE school_id = $1`, [DEV_SCHOOL_ID]);

    await client.query(
      `DELETE FROM invoice_counters WHERE school_id = $1`,
      [DEV_SCHOOL_ID]
    );
    await client.query(
      `DELETE FROM invoice_parent_month_counters WHERE school_id = $1`,
      [DEV_SCHOOL_ID]
    );
  });

  const countsAfter = await queryDb<{
    contracts: string;
    invoices: string;
    payments: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM contracts WHERE school_id = $1) AS contracts,
       (SELECT COUNT(*)::text FROM invoices WHERE school_id = $1) AS invoices,
       (SELECT COUNT(*)::text FROM payments WHERE school_id = $1) AS payments`,
    [DEV_SCHOOL_ID]
  );
  console.log("Po:", countsAfter.rows[0]);
  console.log("Gotowe. Pliki R2 usuń ręcznie.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
