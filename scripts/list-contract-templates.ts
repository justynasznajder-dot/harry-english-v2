import { Pool } from "pg";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schoolId = process.env.SCHOOL_ID?.trim() || "";
    const res = await pool.query<{
      id: string;
      name: string;
      school_year: string | null;
      kind: string;
      active: boolean;
      updated_at: Date;
      html_len: number;
      black_ph: boolean;
      blue_in_ph: boolean;
    }>(
      `SELECT id, name, school_year,
              COALESCE(template_kind, 'CONTRACT') AS kind,
              active, updated_at,
              length(content_html) AS html_len,
              position('color: #1a1a1a' in content_html) > 0 AS black_ph,
              substring(content_html from '\.ph\s*\{[^}]+\}') LIKE '%#1a56db%' AS blue_in_ph
       FROM contract_templates
       WHERE ($1 = '' OR school_id = $1)
       ORDER BY kind, school_year NULLS LAST, active DESC, updated_at DESC`,
      [schoolId]
    );

    const activeYearRes = schoolId
      ? await pool.query<{ name: string }>(
          `SELECT name FROM school_years
           WHERE school_id = $1 AND active = TRUE
           ORDER BY date_from DESC LIMIT 1`,
          [schoolId]
        )
      : { rows: [] as { name: string }[] };

    console.log("SCHOOL_ID:", schoolId || "(all)");
    console.log("Aktywny rok szkolny:", activeYearRes.rows[0]?.name ?? "(brak)");
    console.log("");
    for (const row of res.rows) {
      console.log(
        [
          row.active ? "ACTIVE" : "inactive",
          row.kind.padEnd(12),
          row.school_year ?? "(brak roku)",
          row.blue_in_ph ? "NIEBIESKI.ph" : "czarny.ph",
          row.id,
          row.name,
        ].join(" | ")
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
