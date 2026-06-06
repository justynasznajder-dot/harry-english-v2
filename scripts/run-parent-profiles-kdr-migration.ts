import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Brak DATABASE_URL — ustaw w .env.local lub w zmiennych środowiskowych.");
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "sql", "parent_profiles_large_family_card.sql");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(readFileSync(sqlPath, "utf8"));
    console.log("Migracja parent_profiles_large_family_card.sql — OK");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
