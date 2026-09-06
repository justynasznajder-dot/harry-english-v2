import { loadEnvFiles } from "./load-env";
loadEnvFiles();

const PARENT_ID = "a4456c6b-b4ad-4fb1-8dc8-4b20a51eb4ce";
const CONFIRM = process.env.CONFIRM === "1";

async function main() {
  const { queryDb, runPgTransaction } = await import("../lib/db");

  const parent = await queryDb<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    client_number: string | null;
    school_id: string;
  }>(
    `SELECT id, first_name, last_name, email, client_number, school_id
     FROM users WHERE id = $1 AND role = 'PARENT'`,
    [PARENT_ID]
  );
  const p = parent.rows[0];
  if (!p) throw new Error("Brak rodzica");
  if (p.client_number !== "00043" || p.email !== "test@test.pl") {
    throw new Error(`Nieoczekiwany rodzic: ${JSON.stringify(p)}`);
  }

  const children = await queryDb<{ id: string; enrollment_request_id: string | null }>(
    `SELECT id, enrollment_request_id FROM children WHERE parent_id = $1`,
    [PARENT_ID]
  );
  const childIds = children.rows.map((r) => r.id);
  const erIds = [
    ...new Set(
      children.rows
        .map((r) => r.enrollment_request_id)
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const refs = {
    parent: p,
    childIds,
    erIds,
    attendance: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM attendance WHERE child_id = ANY($1::text[])`, [
        childIds,
      ])
    ).rows[0],
    group_students: (
      await queryDb(
        `SELECT COUNT(*)::int AS c FROM group_students WHERE child_id = ANY($1::text[])`,
        [childIds]
      )
    ).rows[0],
    contracts: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM contracts WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
    contract_children: (
      await queryDb(
        `SELECT COUNT(*)::int AS c FROM contract_children WHERE child_id = ANY($1::text[])`,
        [childIds]
      )
    ).rows[0],
    payments: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM payments WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
    invoices: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM invoices WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
    renewals: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM renewals WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
    complimentary: (
      await queryDb(
        `SELECT COUNT(*)::int AS c FROM school_complimentary_parents WHERE parent_id = $1`,
        [PARENT_ID]
      )
    ).rows[0],
  };

  console.log(JSON.stringify({ mode: CONFIRM ? "APPLY" : "DRY_RUN", refs }, null, 2));
  if (!CONFIRM) {
    console.log('Dry-run OK. APPLY: $env:CONFIRM="1"; npx tsx scripts/purge-test-parent-00043.ts');
    return;
  }

  await runPgTransaction(async (client) => {
    // Clear child → enrollment FK before deleting requests
    await client.query(
      `UPDATE children SET enrollment_request_id = NULL WHERE parent_id = $1`,
      [PARENT_ID]
    );
    await client.query(
      `UPDATE contract_children SET enrollment_request_id = NULL
       WHERE enrollment_request_id = ANY($1::text[])`,
      [erIds]
    );
    await client.query(
      `UPDATE messages SET enrollment_request_id = NULL
       WHERE enrollment_request_id = ANY($1::text[])`,
      [erIds]
    );

    if (erIds.length) {
      await client.query(`DELETE FROM enrollment_requests WHERE id = ANY($1::text[])`, [erIds]);
    }
    await client.query(
      `DELETE FROM enrollment_requests WHERE user_id = $1 OR (
         school_id = $2 AND LOWER(parent_email) = LOWER($3)
       )`,
      [PARENT_ID, p.school_id, p.email]
    );

    await client.query(`DELETE FROM school_complimentary_parents WHERE parent_id = $1`, [
      PARENT_ID,
    ]);

    if (childIds.length) {
      await client.query(`DELETE FROM attendance WHERE child_id = ANY($1::text[])`, [childIds]);
      await client.query(`DELETE FROM child_rewards WHERE child_id = ANY($1::text[])`, [childIds]);
      await client.query(`DELETE FROM progress_notes WHERE child_id = ANY($1::text[])`, [childIds]);
      await client.query(`DELETE FROM group_students WHERE child_id = ANY($1::text[])`, [childIds]);
      await client.query(`DELETE FROM renewals WHERE child_id = ANY($1::text[])`, [childIds]);
      await client.query(
        `DELETE FROM lesson_billing_periods WHERE child_id = ANY($1::text[])`,
        [childIds]
      );
      await client.query(
        `DELETE FROM invoice_items WHERE child_id = ANY($1::text[])`,
        [childIds]
      );
      await client.query(
        `DELETE FROM contract_children WHERE child_id = ANY($1::text[])`,
        [childIds]
      );
    }

    await client.query(`DELETE FROM renewals WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM lesson_billing_periods WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE parent_id = $1)`, [
      PARENT_ID,
    ]);
    await client.query(`DELETE FROM invoices WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM payments WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM contracts WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM parent_profiles WHERE user_id = $1`, [PARENT_ID]);
    await client.query(
      `UPDATE messages SET parent_id = NULL WHERE parent_id = $1`,
      [PARENT_ID]
    );
    await client.query(
      `DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1`,
      [PARENT_ID]
    );

    await client.query(`DELETE FROM children WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM users WHERE id = $1`, [PARENT_ID]);
  });

  console.log(JSON.stringify({ deletedParentId: PARENT_ID, freedClientNumber: "00043" }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
