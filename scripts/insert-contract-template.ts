/**
 * INSERT/UPDATE szablonów umowy i załączników Harry English.
 * Uruchom: npx tsx scripts/insert-contract-template.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { loadEnvFiles } from "./load-env";

type TemplateKind = "CONTRACT" | "ATTACHMENT_1" | "ATTACHMENT_2";

const TEMPLATE_FILES: Array<{ kind: TemplateKind; file: string; namePrefix: string }> = [
  { kind: "CONTRACT", file: "umowa_harry_english_template.html", namePrefix: "Umowa HarryEnglish" },
  { kind: "ATTACHMENT_1", file: "zalacznik_1_wizerunek_template.html", namePrefix: "Załącznik 1 — wizerunek" },
  { kind: "ATTACHMENT_2", file: "zalacznik_2_odbior_template.html", namePrefix: "Załącznik 2 — odbiór lektora" },
];

async function main() {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Brak DATABASE_URL — ustaw w .env.local lub w zmiennych środowiskowych.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const envSchoolId = process.env.SCHOOL_ID?.trim() || "";
    let school: { id: string; name: string } | undefined;

    if (envSchoolId) {
      const envSchoolRes = await pool.query<{ id: string; name: string }>(
        `SELECT id::text, name FROM schools WHERE id::text = $1 LIMIT 1`,
        [envSchoolId]
      );
      school = envSchoolRes.rows[0];
    }

    if (!school) {
      const schoolRes = await pool.query<{ id: string; name: string }>(
        `SELECT id::text, name
         FROM schools
         WHERE LOWER(name) LIKE '%harry%english%'
         ORDER BY active DESC NULLS LAST, created_at ASC
         LIMIT 1`
      );
      school = schoolRes.rows[0];
    }
    if (!school) {
      console.error("Nie znaleziono szkoły Harry English w tabeli schools.");
      process.exit(1);
    }

    const activeYearRes = await pool.query<{ name: string }>(
      `SELECT name
       FROM school_years
       WHERE school_id = $1 AND active = TRUE
       ORDER BY date_from DESC
       LIMIT 1`,
      [school.id]
    );
    const schoolYear = activeYearRes.rows[0]?.name?.trim() || "2025/2026";

    for (const tpl of TEMPLATE_FILES) {
      const templatePath = join(process.cwd(), tpl.file);
      const contentHtml = readFileSync(templatePath, "utf8");
      const templateName = `${tpl.namePrefix} ${schoolYear}`;

      const existing = await pool.query<{ id: string }>(
        `SELECT id::text
         FROM contract_templates
         WHERE school_id = $1
           AND active = TRUE
           AND school_year = $2
           AND COALESCE(template_kind, 'CONTRACT') = $3
         LIMIT 1`,
        [school.id, schoolYear, tpl.kind]
      );

      if (existing.rows[0]) {
        await pool.query(
          `UPDATE contract_templates
           SET name = $2,
               content_html = $3,
               template_kind = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [existing.rows[0].id, templateName, contentHtml, tpl.kind]
        );
        console.log(`Zaktualizowano ${tpl.kind}: ${existing.rows[0].id} (${schoolYear})`);
      } else {
        const insert = await pool.query<{ id: string }>(
          `INSERT INTO contract_templates (
             id, school_id, name, content_html, template_kind, active, school_year, created_at
           ) VALUES (
             gen_random_uuid()::text, $1, $2, $3, $4, TRUE, $5, NOW()
           ) RETURNING id::text`,
          [school.id, templateName, contentHtml, tpl.kind, schoolYear]
        );
        console.log(`Wstawiono ${tpl.kind}: ${insert.rows[0].id} (${schoolYear})`);
      }
    }

    console.log(`Szkoła: ${school.name} (${school.id}), rok: ${schoolYear}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
