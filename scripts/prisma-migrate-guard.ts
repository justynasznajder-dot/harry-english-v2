/**

 * Operacje zapisujące w bazie (Prisma Migrate + legacy SQL).

 * Uruchamiaj tylko po świadomej zgodzie (CONFIRM=1).

 */

import { execSync } from "node:child_process";



const action = process.argv[2];



function requireConfirm(label: string, npmScript: string): void {

  if (process.env.CONFIRM !== "1") {

    console.error(`

⚠️  ${label}



Ta komenda może ZAPISAĆ w bazie (DDL, DML, tabela _prisma_migrations).



Aby kontynuować, uruchom ponownie z:

  CONFIRM=1 npm run ${npmScript}



Przed uruchomieniem: backup Neon + sprawdź DATABASE_URL w .env.local.

`.trim());

    process.exit(1);

  }

}



function runPrisma(args: string): void {

  execSync(`npx prisma ${args}`, { stdio: "inherit", cwd: process.cwd() });

}



function runTsx(scriptPath: string): void {

  execSync(`npx tsx ${scriptPath}`, { stdio: "inherit", cwd: process.cwd() });

}



switch (action) {

  case "create-only": {

    requireConfirm(

      "Tworzenie pliku migracji (migrate dev --create-only)",

      "db:migrate:create-only"

    );

    const extraArgs = process.argv.slice(3).join(" ");

    runPrisma(`migrate dev --create-only${extraArgs ? ` ${extraArgs}` : ""}`);

    break;

  }

  case "resolve-init":

    requireConfirm(

      "Oznaczenie migracji baseline init jako już zastosowanej",

      "db:migrate:resolve-init"

    );

    runPrisma("migrate resolve --applied 20250622120000_init");

    break;

  case "deploy":

    requireConfirm("Wdrożenie oczekujących migracji (migrate deploy)", "db:migrate:deploy");

    runPrisma("migrate deploy");

    break;

  case "dev":

    requireConfirm("Tworzenie i stosowanie migracji dev (migrate dev)", "db:migrate:dev");

    runPrisma("migrate dev");

    break;

  case "attachments":

    requireConfirm("Legacy SQL: contracts_attachments", "db:migrate:attachments");

    runTsx("scripts/run-contracts-attachments-migration.ts");

    break;

  case "unify-ids":

    requireConfirm("Legacy SQL: unify_ids_to_text", "db:migrate:unify-ids");

    runTsx("scripts/run-unify-ids-migration.ts");

    break;

  case "insert-templates":

    requireConfirm("Wstawianie szablonów umów (INSERT/UPDATE)", "db:insert-templates");

    runTsx("scripts/insert-contract-template.ts");

    break;

  default:

    console.error(`Nieznana akcja: ${action}`);

    process.exit(1);

}


