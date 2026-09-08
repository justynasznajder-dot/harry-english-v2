/**
 * 1) Dezaktywuje szablony spoza aktualnego roku szkolnego (2026/2027).
 * 2) Generuje PDF wszystkich aktywnych szablonów do folderu „szablony umów”.
 *
 * Użycie: npx tsx scripts/export-active-contract-templates-pdf.ts
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const CURRENT_YEAR = "2026/2027";
const OUT_DIR = path.join(process.cwd(), "szablony umów");

function safeFilename(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

async function main() {
  const { Pool } = await import("pg");
  const { renderHtmlToPdf } = await import("../lib/contract-pdf");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Idempotentnie: tylko bieżący rok aktywny.
    const deactivated = await pool.query<{ id: string; name: string; school_year: string | null }>(
      `UPDATE contract_templates
       SET active = FALSE
       WHERE school_year IS DISTINCT FROM $1
         AND active = TRUE
       RETURNING id, name, school_year`,
      [CURRENT_YEAR]
    );

    const reactivated = await pool.query<{ id: string; name: string }>(
      `UPDATE contract_templates
       SET active = TRUE
       WHERE school_year = $1
         AND active = FALSE
       RETURNING id, name`,
      [CURRENT_YEAR]
    );

    console.log(`Dezaktywowano (${deactivated.rowCount}):`);
    for (const row of deactivated.rows) {
      console.log(`  - ${row.school_year} | ${row.name}`);
    }
    if (reactivated.rowCount) {
      console.log(`Przywrócono active dla ${CURRENT_YEAR}: ${reactivated.rowCount}`);
    }

    const active = await pool.query<{
      id: string;
      name: string;
      kind: string;
      school_year: string | null;
      school_name: string;
      content_html: string;
    }>(
      `SELECT ct.id, ct.name, COALESCE(ct.template_kind, 'CONTRACT') AS kind,
              ct.school_year, s.name AS school_name, ct.content_html
       FROM contract_templates ct
       JOIN schools s ON s.id = ct.school_id
       WHERE ct.active = TRUE
       ORDER BY s.name, kind, ct.name`
    );

    console.log(`\nAktywne szablony: ${active.rowCount}`);
    for (const row of active.rows) {
      console.log(`  ACTIVE | ${row.kind.padEnd(16)} | ${row.school_year} | ${row.school_name} | ${row.name}`);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const existing of fs.readdirSync(OUT_DIR)) {
      if (existing.toLowerCase().endsWith(".pdf")) {
        fs.unlinkSync(path.join(OUT_DIR, existing));
      }
    }

    // Surowy HTML szablonu — bez podstawiania placeholderów.
    for (const row of active.rows) {
      const pdf = await renderHtmlToPdf(row.content_html);
      const filename = safeFilename(
        `${row.school_name} — ${row.kind} — ${row.school_year} — ${row.name}.pdf`
      );
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, pdf);
      console.log(`PDF: ${filename}`);
    }

    console.log(`\nGotowe. Pliki w: ${OUT_DIR}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
