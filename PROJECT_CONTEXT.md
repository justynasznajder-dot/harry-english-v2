# HarryEnglish v2 — kontekst projektu

> **Dla agentów AI:** ten plik jest rozszerzeniem reguły `.cursor/rules/harryenglish-project.mdc` (ładowana automatycznie). Po większych zmianach w projekcie zaktualizuj też regułę — lub poproś agenta o synchronizację.

## Czym jest projekt

Aplikacja do zarządzania szkołą językową (zapisy, umowy, grupy, zajęcia, obecności, płatności, odnowienia). Panel admina, portal lektora, portal rodzica, portal dziecka.

## Stack

- **Next.js 16** (App Router) + **React** + **TypeScript**
- **PostgreSQL** na **Neon**
- **Baza w runtime:** `pg` + raw SQL przez `lib/db.ts` — **NIE używamy Prisma Client** w aplikacji
- **Schemat bazy:** `prisma/schema.prisma` (źródło prawdy)
- **Migracje:** `prisma/migrations/` — patrz `prisma/MIGRATE.md`
- **Env:** `.env.local` (`DATABASE_URL`, `SCHOOL_ID`, itd.)
- **UI:** Tailwind, główny panel admina: `src/components/AdminPortal.tsx`

## Środowiska i multi-tenant

- **Dev i prod korzystają z TEJ SAMEJ bazy Neon** — każda migracja/backfill dotyka obu szkół.
- **Dev `school_id`:** `efcb641a-e5bd-4e59-aa39-c08fd1b318e9`
- **Prod `school_id`:** `c93d5ac1-fa59-497f-b450-a4e50e1fb50d`
- `SCHOOL_ID` w `.env.local` określa domyślną szkołę lokalnie (rejestracja, publiczne endpointy).
- Role (`users.role`): `ADMIN`, `MANAGER`, `TEACHER`, `PARENT`, `CHILD`
- **ADMIN** — widzi wszystko (bez filtra `school_id` w wielu API)
- **MANAGER** — tylko swoja szkoła (`users.school_id`), przez `resolveAdminPanelTenant()` w `lib/db.ts`

## Architektura danych (skrót)

- Historia roku szkolnego przez `school_year_id` (grupy, zajęcia, umowy, członkostwa)
- `group_students` — unikalność `(group_id, child_id, school_year_id)` — jeden wiersz na rok
- Zamknięcie roku: `DELETE /api/admin/school-years/[id]` z `{ "action": "close" }`
- Historia admina: `GET /api/admin/school-years/[id]/history`
- Statystyki lektorów: `school_year_teacher_stats`
- Log zamknięcia: `school_year_close_logs`

## Migracje bazy

1. Edytuj `prisma/schema.prisma`
2. Generuj SQL: `npm run db:migrate:diff -- --name opis_zmiany`
3. Pokaż **cały** `migration.sql` i **czekaj na akceptację**
4. **Nigdy nie deployuj** bez wyraźnej zgody użytkownika
5. Deploy dopiero po backupie Neon:
   - PowerShell: `$env:CONFIRM="1"; npm run db:migrate:deploy`
   - CMD: `set CONFIRM=1` → `npm run db:migrate:deploy`
6. **Zakazane bez zgody:** `migrate dev`, `migrate reset`, `db push`
7. Backfill historii: `npm run db:backfill:school-year-history`

## Zasady pracy agenta

- Minimalny scope — tylko to, o co proszę; bez over-engineeringu
- Nie commituj bez prośby
- Nie edytuj plików planów (`.plan.md`) ani `.env`
- Dopasuj styl do istniejącego kodu
- Komunikuj po polsku, gdy użytkownik pisze po polsku
- Uruchamiaj komendy sam — nie mów „uruchom to”, tylko zrób

## Kluczowe pliki

| Obszar | Plik |
|--------|------|
| DB / tenant | `lib/db.ts` |
| Enrollment sync | `lib/enrollment-sync.ts` |
| Zamknięcie roku | `lib/school-year-history.ts`, `app/api/admin/school-years/[id]/route.ts` |
| Historia API | `app/api/admin/school-years/[id]/history/route.ts` |
| Panel admina | `src/components/AdminPortal.tsx` |
| Portal lektora | `src/components/LektorPortal.tsx` |
| Schemat | `prisma/schema.prisma` |

## Notatki / aktualny kontekst

<!-- Edytuj poniżej — data, zadania w toku, znane bugi, decyzje -->

- (pusto — uzupełniaj wg potrzeb)
