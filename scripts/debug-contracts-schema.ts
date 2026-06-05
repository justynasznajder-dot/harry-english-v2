import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='contracts' ORDER BY ordinal_position`
  );
  console.log(r.rows);
  await pool.end();
}
main();
