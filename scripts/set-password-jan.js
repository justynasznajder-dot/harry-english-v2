/* eslint-disable */
// Jednorazowy skrypt: ustawia bcrypt-hash hasła dla użytkownika `jan@e-mail.com`.
// Uruchom: node scripts/set-password-jan.js
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const email = "jan@e-mail.com";
  const newPassword = process.argv[2] || "Jan!Pass2026";

  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("Brak DATABASE_URL / POSTGRES_URL w env.");
  }

  const pool = new Pool({ connectionString });
  try {
    const found = await pool.query(
      "SELECT id, email, first_name, last_name, role, school_id, active FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    if (found.rows.length === 0) {
      console.log(JSON.stringify({ ok: false, reason: "USER_NOT_FOUND", email }));
      return;
    }
    console.log("Found users:");
    console.log(JSON.stringify(found.rows, null, 2));

    const hash = await bcrypt.hash(newPassword, 10);
    const upd = await pool.query(
      `UPDATE users
         SET password_hash = $1,
             must_change_password = FALSE
       WHERE LOWER(email) = LOWER($2)
       RETURNING id, email`,
      [hash, email]
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          updated: upd.rows,
          email,
          plain_password: newPassword,
          bcrypt_hash: hash,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
