/**
 * Jednorazowe utworzenie konta księgowej dla szkoły testowej.
 * Użycie: npx tsx scripts/create-test-accountant.ts
 */
import bcrypt from "bcryptjs";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const TEST_SCHOOL_ID = "efcb641a-e5bd-4e59-aa39-c08fd1b318e9";
const EMAIL = "ksiegowa@test.pl";
const PASSWORD = "test123";

async function main() {
  const { createUser, emailExists, getUserByEmail, queryDb } = await import("../lib/db");

  const existingInSchool = await queryDb<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM users
     WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text)
     LIMIT 1`,
    [TEST_SCHOOL_ID, EMAIL]
  );
  if (existingInSchool.rows[0]) {
    const u = existingInSchool.rows[0];
    console.log(`Konto już istnieje: ${u.email} (${u.id}), role=${u.role}`);
    return;
  }

  if (await emailExists(EMAIL, TEST_SCHOOL_ID)) {
    console.log(`Email ${EMAIL} już zajęty w szkole testowej.`);
    return;
  }

  const byLogin = await getUserByEmail(EMAIL);
  if (byLogin) {
    console.log(`Uwaga: getUserByEmail znalazło inne konto: ${byLogin.id} school=${byLogin.school_id}`);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));
  const user = await createUser({
    email: EMAIL,
    passwordHash,
    firstName: "Anna",
    lastName: "Księgowa",
    role: "ACCOUNTANT",
    schoolId: TEST_SCHOOL_ID,
    confirmed: true,
    accessLevel: "ACTIVE",
    mustChangePassword: false,
  });
  console.log(`Utworzono księgową: ${user.email} id=${user.id} school=${user.school_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
