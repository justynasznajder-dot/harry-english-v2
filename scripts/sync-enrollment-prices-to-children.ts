/**
 * Kopiuje stawki z enrollment_requests → children, gdy profil dziecka nie ma jeszcze żadnej stawki.
 *
 * Użycie:
 *   npx tsx scripts/sync-enrollment-prices-to-children.ts           # dry-run
 *   $env:CONFIRM="1"; npx tsx scripts/sync-enrollment-prices-to-children.ts
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const CONFIRM = process.env.CONFIRM === "1";

async function main() {
  const { queryDb } = await import("../lib/db");
  const { syncEnrollmentPricesOntoChildren } = await import("../lib/enrollment-sync");

  const preview = await queryDb<{
    child_id: string;
    client_number: string | null;
    child_name: string;
    er_lesson: string | null;
    er_monthly: string | null;
    er_yearly: string | null;
  }>(
    `SELECT
       c.id AS child_id,
       c.client_number,
       CONCAT(c.first_name, ' ', c.last_name) AS child_name,
       er.lesson_unit_price::text AS er_lesson,
       er.monthly_unit_price::text AS er_monthly,
       er.yearly_unit_price::text AS er_yearly
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     WHERE c.lesson_unit_price IS NULL
       AND c.monthly_unit_price IS NULL
       AND c.yearly_unit_price IS NULL
       AND (
         er.lesson_unit_price IS NOT NULL
         OR er.monthly_unit_price IS NOT NULL
         OR er.yearly_unit_price IS NOT NULL
       )
     ORDER BY c.last_name, c.first_name`
  );

  console.log(
    JSON.stringify(
      {
        mode: CONFIRM ? "APPLY" : "DRY_RUN",
        wouldUpdate: preview.rows.length,
        sample: preview.rows.slice(0, 15),
      },
      null,
      2
    )
  );

  if (!CONFIRM) {
    console.log(
      'Dry-run OK. Aby zapisać: $env:CONFIRM="1"; npx tsx scripts/sync-enrollment-prices-to-children.ts'
    );
    return;
  }

  const updated = await syncEnrollmentPricesOntoChildren();
  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
