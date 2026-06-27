# Prisma Migrate — workflow produkcyjny

Schemat bazy: **`prisma/schema.prisma`**. Runtime aplikacji: **`pg`** (`lib/db.ts`), bez Prisma Client.

Połączenie CLI: `prisma.config.ts` → `DATABASE_URL` z `.env.local`.

---

## Workflow (6 kroków)

| Krok | Kto | Co |
|------|-----|-----|
| **1** | Ty | Edytujesz `prisma/schema.prisma` |
| **2** | Cursor | Generuje migrację do pliku SQL — **bez `migrate dev`** |
| **3** | Cursor | Pokazuje **cały** `migration.sql` |
| **4** | Ty | Akceptujesz SQL (lub prosisz o poprawkę) |
| **5** | Ty | Robisz **backup Neon** |
| **6** | Cursor | Wykonuje `deploy` **dopiero po Twojej wyraźnej zgodzie** |

### Krok 2 — generowanie SQL (bezpieczne, bez zapisu w bazie)

```powershell
npm run db:migrate:diff -- --name opis_zmiany
```

- **Najpierw** uruchamia `npm run db:migrate:status` — jeśli brak `"Database schema is up to date"`, **przerywa** bez tworzenia pliku
- Używa `prisma migrate diff` (nie `migrate dev`)
- Porównuje `prisma/migrations/` → `schema.prisma`
- Zapisuje tylko lokalny plik `prisma/migrations/<timestamp>_opis/migration.sql`
- **Nie** stosuje migracji na bazie

### Krok 6 — deploy (tylko po backupie i zgodzie)

```powershell
$env:CONFIRM=1; npm run db:migrate:deploy
```

---

## Zasady dla Cursor / agenta AI

Przy zmianach schematu agent **musi**:

1. Edytować tylko `schema.prisma` (krok 1).
2. Uruchomić `npm run db:migrate:diff -- --name ...` (krok 2).
3. Wypisać **pełną** treść wygenerowanego `migration.sql` (krok 3).
4. **Czekać** na Twoją akceptację — bez deploy (krok 4).
5. **Nie** uruchamiać deploy, dopóki nie potwierdzisz backupu i zgody (kroki 5–6).

Agent **nigdy** nie uruchamia bez Twojej zgody:

- `npm run db:migrate:deploy`
- `npx prisma migrate dev`
- `npx prisma migrate reset`
- `npx prisma db push`
- `npm run db:migrate:create-only` (używa `migrate dev` — unikaj na produkcji)

---

## ⚠️ Produkcja Neon

Jeśli `DATABASE_URL` w `.env.local` wskazuje produkcję, każda komenda z `CONFIRM=1` jest operacją produkcyjną.

Przed deploy / legacy SQL:

1. **Backup** Neon (wymagany).
2. Sprawdź `DATABASE_URL`.
3. Przejrzyj SQL ręcznie.
4. Uruchom dopiero po świadomej zgodzie.

**Zakazane** (omijają guard):

- `npx prisma migrate dev`
- `npx prisma migrate reset`
- `npx prisma db push`

---

## Komendy bez zapisu w bazie

| Skrypt | Opis |
|--------|------|
| `npm run db:migrate:diff -- --name ...` | Generuje plik SQL lokalnie (wymaga sync: status „up to date”) |
| `npm run db:pull` | Introspekcja bazy → `schema.prisma` |
| `npm run db:migrate:status` | Status migracji |
| `npm run db:verify-ids` | Weryfikacja typów ID |

## Komendy wymagające `CONFIRM=1`

```powershell
$env:CONFIRM=1; npm run db:migrate:deploy
$env:CONFIRM=1; npm run db:migrate:resolve-init
$env:CONFIRM=1; npm run db:migrate:dev          # unikaj — używa migrate dev
$env:CONFIRM=1; npm run db:migrate:create-only   # unikaj — używa migrate dev
$env:CONFIRM=1; npm run db:migrate:attachments
$env:CONFIRM=1; npm run db:migrate:unify-ids
$env:CONFIRM=1; npm run db:insert-templates
```

Baseline `20250622120000_init` — **nie** stosuj przez `deploy` na istniejącej bazie (już oznaczony jako applied).

---

## Neon — połączenie do migracji

`migrate deploy` może wymagać **bezpośredniego** URL (nie pooler). W `.env.local` możesz użyć `DATABASE_URL_UNPOOLED` tymczasowo w `prisma.config.ts`.

## Stare pliki `sql/`

Nie rozwijaj. Nowe zmiany tylko przez `prisma/migrations/`.
