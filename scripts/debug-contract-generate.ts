import { Pool } from "pg";

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() || "";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("SCHOOL_ID", SCHOOL_ID);

    const checks: Array<{ label: string; sql: string; params?: unknown[] }> = [
      {
        label: "schools.city column",
        sql: `SELECT column_name FROM information_schema.columns WHERE table_name='schools' AND column_name='city'`,
      },
      {
        label: "contract_templates.school_year column",
        sql: `SELECT column_name FROM information_schema.columns WHERE table_name='contract_templates' AND column_name='school_year'`,
      },
      {
        label: "active school year",
        sql: `SELECT id, name, active FROM school_years WHERE school_id = $1 ORDER BY active DESC, date_from DESC LIMIT 3`,
        params: [SCHOOL_ID],
      },
      {
        label: "contract templates",
        sql: `SELECT id, name, school_year, active, length(content_html) AS len FROM contract_templates WHERE school_id = $1 ORDER BY created_at DESC LIMIT 5`,
        params: [SCHOOL_ID],
      },
      {
        label: "accepted children",
        sql: `SELECT c.id, c.first_name, c.last_name, c.access_level, c.enrollment_request_id, er.status AS er_status
              FROM children c
              LEFT JOIN enrollment_requests er ON er.id = c.enrollment_request_id
              WHERE c.school_id = $1 AND c.active = TRUE AND UPPER(COALESCE(c.access_level::text,'')) = 'ACCEPTED'
              LIMIT 5`,
        params: [SCHOOL_ID],
      },
      {
        label: "parent_profiles columns",
        sql: `SELECT column_name FROM information_schema.columns WHERE table_name='parent_profiles' ORDER BY ordinal_position`,
      },
    ];

    for (const c of checks) {
      const r = await pool.query(c.sql, c.params ?? []);
      console.log("\n===", c.label, "===");
      console.log(r.rows);
    }

    const child = (
      await pool.query(
        `SELECT c.id, c.parent_id, c.enrollment_request_id
         FROM children c
         WHERE c.school_id = $1 AND c.active = TRUE AND UPPER(COALESCE(c.access_level::text,'')) = 'ACCEPTED'
         LIMIT 1`,
        [SCHOOL_ID]
      )
    ).rows[0];

    if (!child) {
      console.log("\nNo ACCEPTED child found");
      return;
    }

    console.log("\n=== test queries for child", child.id, "===");
    const erId = child.enrollment_request_id;

    try {
      const schoolRes = await pool.query(`SELECT name, city FROM schools WHERE id = $1 LIMIT 1`, [SCHOOL_ID]);
      console.log("schools query ok", schoolRes.rows[0]);
    } catch (e) {
      console.error("schools.city FAIL", e);
    }

    const sy = (
      await pool.query(
        `SELECT id::text, name FROM school_years WHERE school_id = $1 AND active = TRUE ORDER BY date_from DESC LIMIT 1`,
        [SCHOOL_ID]
      )
    ).rows[0];
    console.log("active school year", sy);

    try {
      const template = await pool.query(
        `SELECT id FROM contract_templates WHERE school_id = $1 AND active = TRUE AND school_year = $2 LIMIT 1`,
        [SCHOOL_ID, sy?.name ?? "2025/2026"]
      );
      console.log("template by school_year", template.rows[0] ?? "NOT FOUND");
    } catch (e) {
      console.error("template query FAIL", e);
    }

    try {
      const group = await pool.query(
        `SELECT g.id::text, g.name
         FROM groups g
         JOIN enrollment_requests er ON er.proposed_group_id = g.id
         WHERE er.id = $1`,
        [erId]
      );
      console.log("group", group.rows[0]);
    } catch (e) {
      console.error("group query FAIL", e);
    }

    try {
      const testId = crypto.randomUUID();
      await pool.query("BEGIN");
      await pool.query(
        `INSERT INTO contracts (
           id, school_id, child_id, parent_id, group_id, template_id,
           enrollment_request_id, content_html, status, sent_at,
           payment_type, amount, school_year_id, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, 'SENT', NOW(),
           $9, $10, $11, NOW()
         )`,
        [
          testId,
          SCHOOL_ID,
          child.id,
          child.parent_id,
          (
            await pool.query(
              `SELECT proposed_group_id AS group_id FROM enrollment_requests WHERE id = $1 LIMIT 1`,
              [erId]
            )
          ).rows[0]?.group_id,
          (
            await pool.query(
              `SELECT id FROM contract_templates WHERE school_id = $1 AND active = TRUE ORDER BY created_at DESC LIMIT 1`,
              [SCHOOL_ID]
            )
          ).rows[0]?.id,
          erId,
          "<p>test</p>",
          "MONTHLY",
          120,
          sy?.id ?? null,
        ]
      );
      await pool.query("ROLLBACK");
      console.log("insert contract dry-run ok");
    } catch (e) {
      await pool.query("ROLLBACK").catch(() => {});
      console.error("insert contract FAIL", e);
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
