/**

 * Generuje plik migration.sql z diff schema.prisma vs stan migracji w repo.

 * Bez migrate dev — tylko odczyt historii migracji + zapis pliku lokalnie.

 *

 * Wymaga zsynchronizowanej bazy (migrate status: "Database schema is up to date").

 *

 * Użycie: npm run db:migrate:diff -- --name opis_zmiany

 */

import { execSync } from "node:child_process";

import fs from "node:fs";

import path from "node:path";

import { loadEnvFiles } from "./load-env";



const SYNC_OK = "Database schema is up to date";



function parseNameArg(): string {

  const idx = process.argv.indexOf("--name");

  if (idx === -1 || !process.argv[idx + 1]) {

    console.error(`

Użycie: npm run db:migrate:diff -- --name opis_zmiany



Przykład:

  npm run db:migrate:diff -- --name add_user_notes

`.trim());

    process.exit(1);

  }

  const raw = process.argv[idx + 1].trim();

  if (!/^[a-z0-9_]+$/.test(raw)) {

    console.error("Nazwa migracji: tylko małe litery, cyfry i podkreślniki (snake_case).");

    process.exit(1);

  }

  return raw;

}



function migrationTimestamp(): string {

  const d = new Date();

  const pad = (n: number) => String(n).padStart(2, "0");

  return (

    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +

    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

  );

}



function runMigrateStatus(): string {

  try {

    return execSync("npm run db:migrate:status", {

      cwd: process.cwd(),

      encoding: "utf8",

      env: process.env,

    });

  } catch (error) {

    const e = error as { stdout?: string; stderr?: string };

    return `${e.stdout ?? ""}${e.stderr ?? ""}`;

  }

}



function assertSyncedBeforeDiff(): void {

  console.log("Sprawdzanie synchronizacji: npm run db:migrate:status\n");

  const statusOutput = runMigrateStatus();

  process.stdout.write(statusOutput);

  if (!statusOutput.endsWith("\n")) console.log();



  if (!statusOutput.includes(SYNC_OK)) {

    console.error(`

⚠️  Przerwano generowanie migracji



schema.prisma, prisma/migrations i baza nie są zsynchronizowane.

Nie utworzono pliku migration.sql.



Napraw stan zanim dodasz nową migrację, np.:

  - oczekujące migracje → $env:CONFIRM=1; npm run db:migrate:deploy

  - drift schematu → npm run db:pull lub ręczna korekta schema.prisma

  - baseline → patrz prisma/MIGRATE.md



Sprawdź ponownie: npm run db:migrate:status

`.trim());

    process.exit(1);

  }



  console.log("\n✓ Baza zsynchronizowana z prisma/migrations — generuję diff...\n");

}



loadEnvFiles();

assertSyncedBeforeDiff();



const name = parseNameArg();

const timestamp = migrationTimestamp();

const dirName = `${timestamp}_${name}`;

const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");

const migrationDir = path.join(migrationsRoot, dirName);

const migrationFile = path.join(migrationDir, "migration.sql");



const sql = execSync(

  [

    "npx prisma migrate diff",

    "--from-migrations prisma/migrations",

    "--to-schema prisma/schema.prisma",

    "--script",

  ].join(" "),

  { cwd: process.cwd(), encoding: "utf8" }

).trim();



if (!sql) {

  console.log("Brak różnic między prisma/migrations a schema.prisma — plik migracji nie został utworzony.");

  process.exit(0);

}



fs.mkdirSync(migrationDir, { recursive: true });

fs.writeFileSync(migrationFile, `${sql}\n`, "utf8");



console.log(`\nUtworzono: prisma/migrations/${dirName}/migration.sql\n`);

console.log("─".repeat(72));

console.log(sql);

console.log("─".repeat(72));

console.log(`

Następne kroki (workflow produkcyjny):

  1. Przejrzyj powyższy SQL i zaakceptuj ręcznie.

  2. Zrób backup Neon.

  3. Dopiero po zgodzie: $env:CONFIRM=1; npm run db:migrate:deploy

`.trim());


