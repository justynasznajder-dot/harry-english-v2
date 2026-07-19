import pg from "pg";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const missing = await pool.query<{
    child_id: string;
    group_id: string;
    first_name: string;
    last_name: string;
    group_name: string;
  }>(`
    SELECT cc.child_id, cc.group_id, ch.first_name, ch.last_name, g.name AS group_name
    FROM contract_children cc
    JOIN contracts c ON c.id = cc.contract_id
    JOIN children ch ON ch.id = cc.child_id
    JOIN groups g ON g.id = cc.group_id
    WHERE c.status = 'SIGNED'
      AND cc.group_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM group_students gs
        WHERE gs.group_id = cc.group_id
          AND gs.child_id = cc.child_id
          AND gs.left_at IS NULL
      )
  `);
  console.log("Missing enrollments:", missing.rows.length);
  for (const row of missing.rows) {
    const groupRow = await pool.query<{ school_id: string; school_year_id: string | null }>(
      "SELECT school_id, school_year_id FROM groups WHERE id = $1",
      [row.group_id]
    );
    if (!groupRow.rows[0]) continue;
    const { school_id: schoolId, school_year_id: schoolYearId } = groupRow.rows[0];
    const prior = await pool.query<{ id: string; school_year_id: string | null; left_at: string | null }>(
      `SELECT id, school_year_id, left_at::text FROM group_students
       WHERE group_id = $1 AND child_id = $2 AND school_year_id IS NOT DISTINCT FROM $3
       LIMIT 1`,
      [row.group_id, row.child_id, schoolYearId]
    );
    if (prior.rows[0]) {
      if (prior.rows[0].left_at == null) continue;
      await pool.query(
        `UPDATE group_students SET left_at = NULL, enrolled_at = NOW(), school_id = $2 WHERE id = $1`,
        [prior.rows[0].id, schoolId]
      );
    } else {
      await pool.query(
        `INSERT INTO group_students (id, school_id, group_id, child_id, enrolled_at, school_year_id)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [randomUUID(), schoolId, row.group_id, row.child_id, schoolYearId]
      );
    }
    console.log("Enrolled:", row.first_name, row.last_name, "->", row.group_name);
  }

  const counts = await pool.query<{ name: string; students: number }>(`
    SELECT g.name, COUNT(gs.id) FILTER (WHERE gs.left_at IS NULL)::int AS students
    FROM groups g
    LEFT JOIN group_students gs ON gs.group_id = g.id
    GROUP BY g.id, g.name
    ORDER BY g.name
  `);
  console.log("Group counts:", counts.rows);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
