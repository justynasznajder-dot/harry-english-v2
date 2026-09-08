import { loadEnvFiles } from "./load-env";
loadEnvFiles();

/** Magdalena Promny — prod school */
const PARENT_ID = "ae017a7d-3f27-4078-968e-ed4e479d32fa";
const SCHOOL_ID = "c93d5ac1-fa59-497f-b450-a4e50e1fb50d";
const EXPECTED_EMAIL = "magdalena.promny@gmail.com";
const EXPECTED_LAST = "promny";
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
  if (p.school_id !== SCHOOL_ID) throw new Error(`Zła szkoła: ${p.school_id}`);
  if (p.email.toLowerCase() !== EXPECTED_EMAIL) {
    throw new Error(`Nieoczekiwany email: ${p.email}`);
  }
  if (p.last_name.toLowerCase() !== EXPECTED_LAST) {
    throw new Error(`Nieoczekiwane nazwisko: ${p.last_name}`);
  }

  const children = await queryDb<{
    id: string;
    first_name: string;
    last_name: string;
    enrollment_request_id: string | null;
  }>(`SELECT id, first_name, last_name, enrollment_request_id FROM children WHERE parent_id = $1`, [
    PARENT_ID,
  ]);
  for (const ch of children.rows) {
    if (ch.last_name.toLowerCase() !== EXPECTED_LAST) {
      throw new Error(`Dziecko nie-Promny: ${JSON.stringify(ch)}`);
    }
  }

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
    children: children.rows,
    erIds,
    group_students: (
      await queryDb(
        `SELECT COUNT(*)::int AS c FROM group_students WHERE child_id = ANY($1::text[])`,
        [childIds]
      )
    ).rows[0],
    parent_profiles: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM parent_profiles WHERE user_id = $1`, [
        PARENT_ID,
      ])
    ).rows[0],
    contracts: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM contracts WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
    payments: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM payments WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
    invoices: (
      await queryDb(`SELECT COUNT(*)::int AS c FROM invoices WHERE parent_id = $1`, [PARENT_ID])
    ).rows[0],
  };

  console.log(JSON.stringify({ mode: CONFIRM ? "APPLY" : "DRY_RUN", refs }, null, 2));
  if (!CONFIRM) {
    console.log('Dry-run OK. APPLY: $env:CONFIRM="1"; npx tsx scripts/purge-promny-parent.ts');
    return;
  }

  await runPgTransaction(async (client) => {
    await client.query(`UPDATE children SET enrollment_request_id = NULL WHERE parent_id = $1`, [
      PARENT_ID,
    ]);
    if (erIds.length) {
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
      await client.query(
        `UPDATE contracts SET enrollment_request_id = NULL
         WHERE enrollment_request_id = ANY($1::text[])`,
        [erIds]
      );
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
      await client.query(`DELETE FROM subscriptions WHERE child_id = ANY($1::text[])`, [childIds]);
      await client.query(`DELETE FROM child_auth WHERE child_id = ANY($1::text[])`, [childIds]);
    }

    await client.query(`DELETE FROM renewals WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM lesson_billing_periods WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(
      `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE parent_id = $1)`,
      [PARENT_ID]
    );
    await client.query(`DELETE FROM invoices WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM payments WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM contracts WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM subscriptions WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM invoice_parent_month_counters WHERE parent_id = $1`, [
      PARENT_ID,
    ]);
    await client.query(`DELETE FROM parent_profiles WHERE user_id = $1`, [PARENT_ID]);
    await client.query(`UPDATE messages SET parent_id = NULL WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1`, [
      PARENT_ID,
    ]);

    await client.query(`DELETE FROM children WHERE parent_id = $1`, [PARENT_ID]);
    await client.query(`DELETE FROM users WHERE id = $1`, [PARENT_ID]);
  });

  const leftover = await queryDb(
    `SELECT 'users' AS t, COUNT(*)::int AS c FROM users WHERE id = $1
     UNION ALL SELECT 'children', COUNT(*)::int FROM children WHERE parent_id = $1
     UNION ALL SELECT 'er', COUNT(*)::int FROM enrollment_requests
       WHERE school_id = $2 AND LOWER(parent_last_name) LIKE '%promny%'`,
    [PARENT_ID, SCHOOL_ID]
  );

  console.log(
    JSON.stringify(
      {
        deletedParentId: PARENT_ID,
        freedClientNumber: p.client_number,
        leftover: leftover.rows,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
