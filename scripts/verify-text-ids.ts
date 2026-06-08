import { Pool } from "pg";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND udt_name = 'uuid'
       ORDER BY table_name, column_name`
    );
    if (r.rows.length === 0) {
      console.log("OK — brak kolumn UUID w bazie.");
      return;
    }
    console.error(`Znaleziono ${r.rows.length} kolumn UUID:`);
    for (const row of r.rows) {
      console.error(`  ${row.table_name}.${row.column_name}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
