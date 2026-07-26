/**
 * Jednorazowe: hasła wszystkich rodziców szkoły testowej → test123,
 * bez wymuszania zmiany (must_change_password = false).
 * Użycie: npx tsx scripts/reset-test-parent-passwords.ts
 */
import bcrypt from "bcryptjs";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const TEST_SCHOOL_ID = "efcb641a-e5bd-4e59-aa39-c08fd1b318e9";
const PROD_SCHOOL_ID = "c93d5ac1-fa59-497f-b450-a4e50e1fb50d";
const PASSWORD = "test123";

async function main() {
  const { queryDb } = await import("../lib/db");

  const before = await queryDb<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM users WHERE school_id = $1 AND role = 'PARENT'`,
    [TEST_SCHOOL_ID]
  );
  console.log("Parents on test school:", before.rows[0]?.cnt);

  const passwordHash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));
  const result = await queryDb<{ id: string; email: string }>(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = FALSE,
         reset_token = NULL,
         reset_token_expiry = NULL
     WHERE school_id = $2 AND role = 'PARENT'
     RETURNING id, email`,
    [passwordHash, TEST_SCHOOL_ID]
  );

  console.log("Updated:", result.rows.length);
  for (const r of result.rows) {
    console.log("-", r.email, r.id);
  }

  const prodCheck = await queryDb<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM users
     WHERE school_id = $1 AND role = 'PARENT' AND password_hash = $2`,
    [PROD_SCHOOL_ID, passwordHash]
  );
  console.log(
    "Prod parents matching new hash (should be 0):",
    prodCheck.rows[0]?.cnt
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
