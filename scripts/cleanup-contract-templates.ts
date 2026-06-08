/**
 * Zostawia aktywne tylko poprawne szablony (czarny .ph) na bieżący rok szkolny.
 * Uruchom: npx tsx scripts/cleanup-contract-templates.ts
 */
import { Pool } from "pg";
import { loadEnvFiles } from "./load-env";

const KEEP_IDS = [
  "6caeb1cd-f589-4348-87c4-aff9972c3685",
  "35ac291b-f8a8-40d0-bcba-995874ea6468",
  "810d6556-40bd-432b-98d0-519308fd9180",
];

async function main() {
  loadEnvFiles();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Brak DATABASE_URL");
    process.exit(1);
  }

  const schoolId = process.env.SCHOOL_ID?.trim();
  if (!schoolId) {
    console.error("Brak SCHOOL_ID w .env.local");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const verify = await pool.query<{
      id: string;
      name: string;
      kind: string;
      school_year: string | null;
      blue_in_ph: boolean;
    }>(
      `SELECT id, name, COALESCE(template_kind, 'CONTRACT') AS kind, school_year,
              substring(content_html from '\.ph\s*\{[^}]+\}') LIKE '%#1a56db%' AS blue_in_ph
       FROM contract_templates
       WHERE id = ANY($1::text[])`,
      [KEEP_IDS]
    );

    const missing = KEEP_IDS.filter((id) => !verify.rows.some((r) => r.id === id));
    if (missing.length > 0) {
      console.error("Nie znaleziono szablonów do zachowania:", missing.join(", "));
      process.exit(1);
    }

    const badKeep = verify.rows.filter((r) => r.blue_in_ph);
    if (badKeep.length > 0) {
      console.error("Szablony do zachowania mają niebieski .ph — najpierw uruchom db:insert-templates:");
      for (const row of badKeep) console.error(" ", row.id, row.name);
      process.exit(1);
    }

    console.log("Zachowane (aktywne) szablony:");
    for (const row of verify.rows) {
      console.log(`  ${row.kind}: ${row.id} (${row.school_year}) — ${row.name}`);
    }

    const deactivated = await pool.query<{ id: string; name: string; kind: string }>(
      `UPDATE contract_templates
       SET active = FALSE, updated_at = NOW()
       WHERE school_id = $1
         AND active = TRUE
         AND id <> ALL($2::text[])
       RETURNING id, name, COALESCE(template_kind, 'CONTRACT') AS kind`,
      [schoolId, KEEP_IDS]
    );

    await pool.query(
      `UPDATE contract_templates
       SET active = TRUE, updated_at = NOW()
       WHERE id = ANY($1::text[])`,
      [KEEP_IDS]
    );

    if (deactivated.rowCount === 0) {
      console.log("\nBrak duplikatów do dezaktywacji — tabela już czysta.");
    } else {
      console.log(`\nDezaktywowano ${deactivated.rowCount} zbędnych szablonów:`);
      for (const row of deactivated.rows) {
        console.log(`  ${row.kind}: ${row.id} — ${row.name}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
