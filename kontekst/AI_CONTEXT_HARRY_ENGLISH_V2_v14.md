# HarryEnglish v2 — Kontekst projektu dla AI

Ten plik służy do przekazania kontekstu do nowego czatu AI. Wklej go na początku rozmowy.

---

## Prompt startowy

"Pracujemy nad projektem Next.js `HarryEnglish v2` — aplikacją do zarządzania szkołą językową. Backend to route handlers w `app/api/`, baza to PostgreSQL (Neon) — głównie raw SQL przez `pg` (`lib/db.ts`), schemat opisany też w `prisma/schema.prisma`. Baza ma ok. 28 tabel (w tym `enrollment_proposals`). Auth bazuje na JWT (jose) — cookie `auth-token` zawiera podpisany token z polami userId, role, schoolId, accessLevel. Portal `/portal` renderuje 5 ról: `ADMIN`, `MANAGER`, `TEACHER`, `PARENT`, `CHILD`. Kolumna role jest typu TEXT (nie enum). Zapis dziecka: `enrollment_requests` + historia propozycji w `enrollment_proposals` (statusy PENDING/ACCEPTED/REJECTED); zgłoszenie może być w `NEGOTIATING` po odrzuceniu propozycji przez rodzica. Rodzic po rejestracji ma `access_level = PENDING` — ograniczony dostęp do czasu podpisania umowy. Projekt jest multi-tenant — każda tabela ma `school_id`. ADMIN (superadmin) ma `school_id = NULL` i widzi wszystkie szkoły. MANAGER ma `school_id` swojej szkoły i widzi tylko jej dane. school_id PROD = c93d5ac1-fa59-497f-b450-a4e50e1fb50d (Harry English, slug: harry-english). school_id DEV = efcb641a-e5bd-4e59-aa39-c08fd1b318e9 (Harry English Test, slug: harry-english-test). Potrzebuję zmian zgodnych z obecnym modelem. Najpierw przeanalizuj wpływ na tabele, endpointy API i komponenty portalu."

---

## 1. Stack technologiczny

- **Framework**: Next.js 16 App Router, React 19, TypeScript
- **Stylowanie**: Tailwind CSS v4
- **Baza**: PostgreSQL (Neon) — raw SQL przez pakiet `pg`, bez ORM
- **Auth**: JWT (jose) — cookie `auth-token` (httpOnly, 7 dni), payload: `{ userId, role, schoolId, accessLevel }`
- **Maile**: nodemailer (Zoho SMTP) z fallbackiem hostów
- **Hosting**: Vercel (projekt: `harry-english-v2`)
- **Repo**: GitHub (`harry-english-v2`)

### Komendy
```bash
npm run dev
npm run build
npm run start
npm run lint
```

---

## 2. Struktura projektu

```
app/
  page.tsx                         # Landing page szkoly
  layout.tsx                       # Globalny layout
  portal/
    login/page.tsx                 # Logowanie doroslych
    child-login/page.tsx           # Logowanie dzieci (TODO)
    zmien-haslo/page.tsx           # Wymuszona zmiana hasla po pierwszym logowaniu
    page.tsx                       # Router widoku wg roli i access_level
  api/
    auth/
      login/route.ts
      logout/route.ts
      register/route.ts
      forgot-password/route.ts
      reset-password/route.ts
      change-password/route.ts        # zmiana hasla po pierwszym logowaniu (must_change_password)
    admin/
      users/route.ts
      users/[id]/route.ts
      children/route.ts
      children/[id]/route.ts
      groups/route.ts
      groups/[id]/route.ts
      schedule-templates/route.ts
      schedule-templates/[id]/route.ts
      group-students/route.ts
      group-students/[id]/route.ts
      lessons/generate/route.ts
      enrollment/route.ts          # GET lista zgłoszeń + POST wyślij propozycję
      enrollment/proposals/route.ts # GET historia propozycji (?enrollmentRequestId=)
      school-years/route.ts
      school-years/[id]/route.ts
      school-holidays/route.ts
      school-holidays/[id]/route.ts
    enrollment/
      accept/route.ts              # PUT — rodzic akceptuje propozycję (multi-child: requestId)
      reject/route.ts              # POST — rodzic odrzuca PENDING → NEGOTIATING
      sign/route.ts
      status/route.ts              # GET — lista kart PROPOSED/NEGOTIATING/ACCEPTED/SIGNED
    user/
      me/route.ts                  # zwraca schoolId (null dla ADMIN)
      profile/route.ts             # GET/PUT danych parent_profiles
      enrollment/proposals/route.ts # GET historia propozycji dla rodzica (własne zgłoszenia)
    students/
      add/route.ts
      resign/route.ts
    contact/route.ts

src/components/
  AdminPortal.tsx                  # Panel managera/admina szkoly
  UserPortal.tsx                   # Portal rodzica (pelny dostep)
  PendingPortal.tsx                # Rodzic czeka na propozycje grupy
  ProposedPortal.tsx               # Rodzic akceptuje termin
  ContractPortal.tsx               # Rodzic podpisuje umowe
  TeacherPortal.tsx                # Portal nauczyciela (w budowie)
  ChildPortal.tsx                  # Portal dziecka (w budowie)

lib/
  db.ts                            # Polaczenie z baza + funkcje pomocnicze
  auth.ts                          # JWT: signToken, verifyToken, getTokenFromRequest
  enrollment-status.ts             # ENROLLMENT_STATUSES (+ NEGOTIATING)
  enrollment-proposals-list-sql.ts # wspólne SQL listy propozycji (admin + parent)
  email.ts                         # Szablony maili i wysylka (m.in. sendProposalRejectedEmail)
  password.ts                      # generateTempPassword + validateStrongPassword
middleware.ts                      # Ochrona /portal/* — weryfikacja JWT

sql/                               # Migracje SQL uruchamiane recznie po deploy
  enrollment_proposals.sql         # CREATE TABLE enrollment_proposals + indeks UNIQUE (1× PENDING / request)
  users_must_change_password.sql   # ADD COLUMN users.must_change_password
  children_preferred_location.sql
  marketing_content.sql
  school_years_setup.sql
```

---

## 3. Multi-tenant i szkoły

Kazda tabela zawiera `school_id`. Dwie szkoły w bazie:

```
PROD:
  school_id = c93d5ac1-fa59-497f-b450-a4e50e1fb50d
  name      = Harry English
  slug      = harry-english

DEV:
  school_id = efcb641a-e5bd-4e59-aa39-c08fd1b318e9
  name      = Harry English Test
  slug      = harry-english-test
```

**Konta systemowe:**
```
Superadmin:  admin@admin.pl           role=ADMIN,   school_id=NULL
Manager PROD: manager@harry-english.pl role=MANAGER, school_id=PROD
Manager DEV:  test_manager@harry-english.pl role=MANAGER, school_id=DEV
```

**Ważne zasady multi-tenant:**
- `SCHOOL_ID` w `.env.local` i Vercel env — używane przy rejestracji rodzica i publicznych endpointach
- `resolveAdminPanelTenant(userId)` w `lib/db.ts` — dla MANAGER zwraca `actor.school_id`, dla ADMIN zwraca `null`
- Wszystkie handlery `app/api/admin/**` używają `resolveAdminPanelTenant` — ADMIN widzi wszystkie szkoły, MANAGER tylko swoją

---

## 4. Zabezpieczenia bazy danych

```sql
-- superadmin nie ma school_id
ALTER TABLE users ALTER COLUMN school_id DROP NOT NULL;

-- każdy inny user musi mieć school_id
ALTER TABLE users ADD CONSTRAINT check_school_id
  CHECK (role = 'ADMIN' OR school_id IS NOT NULL);
```

---

## 5. Model danych — wszystkie tabele (28)

### schools
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| name | VARCHAR(255) | Nazwa szkoly |
| slug | VARCHAR(255) UNIQUE | URL identyfikator |
| timezone | VARCHAR(100) | Strefa czasowa (domyslnie Europe/Warsaw) |
| active | BOOLEAN | Aktywna |
| created_at | TIMESTAMP | Data utworzenia |

### users
Dorosli uzytkownicy: ADMIN, MANAGER, TEACHER, PARENT.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola (NULL dla ADMIN) |
| email | VARCHAR(255) | Email (unikalny per szkola) |
| password_hash | VARCHAR(255) | Hash bcrypt |
| role | TEXT | ADMIN / MANAGER / TEACHER / PARENT |
| first_name | VARCHAR(100) | Imie |
| last_name | VARCHAR(100) | Nazwisko |
| phone | VARCHAR(50) | Telefon (opcjonalny) |
| active | BOOLEAN | Soft-delete |
| confirmed | BOOLEAN | Potwierdzone konto |
| access_level | TEXT | PENDING / PROPOSED / CONTRACT_SENT / ACTIVE |
| reset_token | VARCHAR(255) | Token resetu hasla |
| reset_token_expiry | TIMESTAMP | Wygasniecie tokenu (1h) |
| must_change_password | BOOLEAN | TRUE = pierwsze logowanie po wygenerowaniu konta przez admina; portal wymusza zmianę tymczasowego hasła |
| resignation_date | TIMESTAMP | Data dezaktywacji |
| last_login | TIMESTAMP | Ostatnie logowanie |
| created_at | TIMESTAMP | Data rejestracji |

**access_level — poziomy dostepu rodzica:**
- `PENDING` — konto zalozone, czeka na propozycje grupy od managera
- `PROPOSED` — manager zaproponowal grupe, rodzic musi zaakceptowac termin
- `CONTRACT_SENT` — rodzic zaakceptowal, umowa gotowa do podpisania
- `ACTIVE` — umowa podpisana, pelny dostep do portalu

ADMIN, MANAGER i TEACHER zawsze maja `access_level = ACTIVE`.

### children
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| parent_id | TEXT FK | Rodzic (users.id) |
| first_name | VARCHAR(100) | Imie |
| last_name | VARCHAR(100) | Nazwisko |
| birth_date | DATE | Data urodzenia |
| avatar_url | TEXT | Avatar (system nagrod) |
| xp_total | INTEGER | Laczny XP |
| active | BOOLEAN | Soft-delete |
| confirmed | BOOLEAN | Potwierdzone po podpisaniu umowy |
| enrollment_request_id | TEXT FK | Powiazane zgloszenie (opcjonalne) |
| resignation_requested | BOOLEAN | Zgloszona rezygnacja |
| resignation_reason | TEXT | Powod rezygnacji |
| resignation_date | TIMESTAMP | Data rezygnacji |
| created_at | TIMESTAMP | Data dodania |

### child_auth
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| child_id | TEXT FK UNIQUE | Dziecko (ON DELETE CASCADE) |
| username | VARCHAR(100) UNIQUE | Login dziecka |
| password_hash | VARCHAR(255) | Hash bcrypt |
| last_login | TIMESTAMP | Ostatnie logowanie |

### locations
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| name | VARCHAR(255) | Nazwa lokalizacji |
| address | TEXT | Adres (opcjonalny) |
| active | BOOLEAN | Aktywna |

### groups
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| teacher_id | TEXT FK | Nauczyciel (users.id) |
| name | VARCHAR(255) | Nazwa grupy |
| level | VARCHAR(100) | Poziom (A1, A2, B1...) |
| max_students | INTEGER | Maks uczniow (domyslnie 12) |
| school_year_id | TEXT FK | Rok szkolny |
| active | BOOLEAN | Aktywna |
| created_at | TIMESTAMP | Data utworzenia |

### group_students
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| child_id | TEXT FK | Dziecko |
| enrolled_at | DATE | Data zapisania |
| left_at | DATE | Data opuszczenia (NULL = aktywny) |
| school_year_id | TEXT FK | Rok szkolny |

### schedule_templates
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| location_id | TEXT FK | Lokalizacja |
| day_of_week | INTEGER | 1=pn, 7=nd |
| start_time | TIME | Godzina rozpoczecia |
| duration_min | INTEGER | Czas trwania w minutach |
| school_year_id | TEXT FK | Rok szkolny |

### lessons
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| teacher_id | TEXT FK | Nauczyciel |
| location_id | TEXT FK | Lokalizacja |
| scheduled_at | TIMESTAMP | Data i godzina |
| duration_min | INTEGER | Czas trwania |
| status | TEXT | SCHEDULED / COMPLETED / CANCELLED |
| notes | TEXT | Notatki |
| cancellation_reason | TEXT | Powod odwolania |
| school_year_id | TEXT FK | Rok szkolny |
| created_at | TIMESTAMP | Data utworzenia |

### attendance
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| lesson_id | TEXT FK | Zajecia |
| child_id | TEXT FK | Dziecko |
| status | TEXT | PRESENT / ABSENT / EXCUSED / LATE |
| note | TEXT | Notatka |

### materials, group_materials, progress_notes, subscriptions, announcements, rewards, child_rewards
Tabele modułów: materiały edukacyjne, postępy, nagrody — szczegóły bez zmian od v9.

### messages
Wiadomości między rodzicem a managerem w ramach aplikacji.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| parent_id | TEXT FK | Rodzic (users.id) |
| sender_id | TEXT FK | Nadawca (users.id) |
| sender_role | TEXT | MANAGER / PARENT |
| enrollment_request_id | TEXT FK | Powiazane zgloszenie |
| content | TEXT | Tresc wiadomosci |
| read_at | TIMESTAMP | Data odczytania |
| created_at | TIMESTAMP | Data utworzenia |

### payments
Lista platnosci rodzica za zajecia.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| child_id | TEXT FK | Dziecko |
| parent_id | TEXT FK | Rodzic |
| contract_id | TEXT FK | Umowa |
| amount | DECIMAL | Kwota |
| status | TEXT | PAID / PENDING / OVERDUE |
| due_date | DATE | Termin platnosci |
| paid_at | TIMESTAMP | Data platnosci |
| period_month | DATE | Miesiac ktorego dotyczy platnosc (np. 2025-10-01) |
| description | TEXT | Opis (np. "Zajecia pazdziernik 2025") |
| created_at | TIMESTAMP | Data utworzenia |

### attendances
Obecnosci dzieci na zajęciach.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| lesson_id | TEXT FK | Zajecia |
| child_id | TEXT FK | Dziecko |
| status | TEXT | PRESENT / ABSENT / EXCUSED |
| note | TEXT | Notatka (np. powod nieobecnosci) |
| created_at | TIMESTAMP | Data utworzenia |

Constraint UNIQUE na parze `(lesson_id, child_id)`.

### enrollment_requests
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| status | enrollment_status (ENUM) | NEW / PROPOSED / **NEGOTIATING** / ACCEPTED / SIGNED / COMPLETED / REJECTED |
| proposed_group_id | TEXT FK | Aktualnie proponowana grupa (NULL po odrzuceniu przez rodzica) |
| proposed_at | TIMESTAMP | Kiedy wysłano bieżącą propozycję |
| user_id | TEXT FK | Konto rodzica (po rejestracji / po „Wyślij propozycję”) |
| parent_* / child_* | TEXT/DATE | Dane z formularza publicznego |
| accepted_at, contract_signed, … | | Po akceptacji / podpisie |
| created_at | TIMESTAMP | Data zgloszenia |

**Uwaga:** `rejection_comment` **nie jest już** na `enrollment_requests` — komentarz rodzica przy odrzuceniu trafia do `enrollment_proposals.rejection_comment`. Kod w `getDbShape()` nadal wykrywa starą kolumnę dla ścieżki legacy (gdy brak tabeli `enrollment_proposals`).

**Przepływ statusów zgłoszenia:**
```
NEW → PROPOSED          (manager wysyła propozycję)
PROPOSED → NEGOTIATING  (rodzic odrzuca — czeka na nową propozycję)
NEGOTIATING → PROPOSED  (manager wysyła kolejną)
PROPOSED → ACCEPTED     (rodzic akceptuje)
PROPOSED / NEGOTIATING → REJECTED  (manager kończy ręcznie — jeśli używane)
```

### enrollment_proposals
Historia propozycji grup — jedna aktywna (`PENDING`) na `enrollment_request_id` (partial UNIQUE index).

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| enrollment_request_id | TEXT FK | Zgłoszenie |
| group_id | TEXT FK | Proponowana grupa |
| proposed_by | TEXT FK | Manager/admin (`users.id`) |
| proposed_at | TIMESTAMPTZ | Data wysłania |
| status | TEXT | PENDING / ACCEPTED / REJECTED |
| responded_at | TIMESTAMPTZ | Kiedy rodzic zaakceptował/odrzucił |
| rejection_comment | TEXT | Komentarz rodzica (przy REJECTED) |
| created_at | TIMESTAMPTZ | |

Migracja: `sql/enrollment_proposals.sql`. Detekcja w runtime: `getDbShape().hasEnrollmentProposalsTable`.

**Limit miękki:** UI managera ostrzega przy `proposal_count >= 3` — baza nie blokuje kolejnych propozycji.

### parent_profiles
Dodatkowe dane rodzica (adres, dane do umowy). Jeden rekord per rodzic, tworzony automatycznie przy rejestracji.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| user_id | TEXT FK UNIQUE | Rodzic (users.id, CASCADE DELETE) |
| school_id | TEXT FK | Szkola |
| address | TEXT | Adres |
| city | TEXT | Miasto |
| zip_code | VARCHAR(10) | Kod pocztowy |
| created_at | TIMESTAMP | Data utworzenia |
| updated_at | TIMESTAMP | Data aktualizacji |

### contract_templates
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| name | VARCHAR(255) | Nazwa szablonu |
| content_html | TEXT | Tresc HTML z placeholderami |
| active | BOOLEAN | Aktywny szablon |
| created_at | TIMESTAMP | Data utworzenia |

Placeholdery: {{parent_first_name}}, {{parent_last_name}}, {{child_first_name}}, {{child_last_name}}, {{child_birth_date}}, {{group_name}}, {{location_name}}, {{schedule}}, {{price_monthly}}, {{payment_due_day}}, {{start_date}}, {{contract_date}}, {{signed_at}}

### contracts
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| child_id | TEXT FK | Dziecko |
| parent_id | TEXT FK | Rodzic |
| group_id | TEXT FK | Grupa |
| template_id | TEXT FK | Uzyty szablon |
| content_html | TEXT | Wygenerowana tresc umowy |
| status | TEXT | DRAFT / SENT / SIGNED |
| payment_type | TEXT | MONTHLY / ONE_TIME |
| amount | DECIMAL | Kwota miesieczna |
| payment_due_day | INTEGER | Dzien miesiaca w ktorym przypada platnosc (np. 10) |
| sent_at | TIMESTAMP | Data wyslania |
| signed_at | TIMESTAMP | Data podpisania |
| signed_ip | TEXT | IP rodzica przy podpisaniu |
| school_year_id | TEXT FK | Rok szkolny |
| created_at | TIMESTAMP | Data wygenerowania |

### school_years
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| name | VARCHAR(100) | Nazwa (np. 2025/2026) |
| date_from | DATE | Poczatek roku szkolnego |
| date_to | DATE | Koniec roku szkolnego |
| active | BOOLEAN | Aktywny rok (tylko jeden na raz) |
| created_at | TIMESTAMP | Data utworzenia |

### school_holidays
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| school_year_id | TEXT FK | Rok szkolny (opcjonalny) |
| name | VARCHAR(255) | Nazwa |
| date_from | DATE | Poczatek okresu wolnego |
| date_to | DATE | Koniec okresu wolnego |
| type | TEXT | HOLIDAY / PUBLIC / SCHOOL / CANCELLED |
| created_at | TIMESTAMP | Data dodania |

---

## 6. Role i dostep

| Rola | Opis | school_id | access_level |
|------|------|-----------|-------------|
| ADMIN | Super admin, wszystkie szkoly | NULL | zawsze ACTIVE |
| MANAGER | Zarzadca konkretnej szkoly | wymagane | zawsze ACTIVE |
| TEACHER | Nauczyciel | wymagane | zawsze ACTIVE |
| PARENT | Rodzic | wymagane | PENDING / PROPOSED / CONTRACT_SENT / ACTIVE |
| CHILD | Dziecko (loguje sie przez child_auth) | wymagane | n/d |

---

## 7. Auth i autoryzacja

- Logowanie doroslych: email + haslo → JWT w cookie `auth-token` (httpOnly, secure, 7 dni)
- JWT payload: `{ userId, role, schoolId, accessLevel }` — podpisany algorytmem HS256
- Biblioteka: `jose` (kompatybilna z Next.js Edge Runtime)
- Pliki auth: `lib/auth.ts` — `signToken()`, `verifyToken()`, `getTokenFromRequest()`
- Logowanie dzieci: username + haslo → osobny endpoint, osobne cookie
- Middleware: weryfikuje JWT dla `/portal/*`, przy nieprawidlowym tokenie usuwa cookie i przekierowuje na `/portal/login`

### Pierwsze logowanie / wymuszona zmiana hasła
- Konta rodziców tworzone z poziomu „Wyślij propozycję dla dziecka" mają `must_change_password=TRUE` i tymczasowe hasło w formacie `xxxx-9999` (4 male litery + `-` + 4 cyfry, bez mylacych znakow 0/O/1/I/l). Hasło NIE spelnia regul `validateStrongPassword` — to celowe, zmusza do zmiany.
- `POST /api/auth/login` zwraca pole `mustChangePassword: boolean` (na poziomie root i w `user.mustChangePassword`).
- `GET /api/user/me` zwraca `user.mustChangePassword`.
- Front: `AuthModal`, `/portal/login`, `/portal` — jeśli flaga `true`, przekierowanie na `/portal/zmien-haslo`. Strona zmiany hasła sama wymusza zalogowanie i nie wpuszcza do `/portal` zanim hasło nie zostanie zmienione.
- `POST /api/auth/change-password` — body `{ currentPassword, newPassword }`. Waliduje stare (bcrypt, z fallbackiem `$2y$`), nowe musi spełniać reguły z `lib/password.ts` (min 8, A-Z + a-z + 0-9 + znak specjalny), nie może być równe staremu. Po sukcesie zeruje `must_change_password`.
- Reset hasła przez `forgot-password` / `reset-password` działa niezależnie i również wymaga silnego hasła.

### Portal routing (app/portal/page.tsx)
```
role = ADMIN lub MANAGER → AdminPortal
role = TEACHER → TeacherPortal
role = PARENT → UserPortal (jeden komponent obsługuje wszystkie access_level przez stepper)
role = CHILD → ChildPortal
```

UserPortal zakładki:
- Proces zapisu — stepper wg `users.access_level`; karty per dziecko z `GET /api/enrollment/status`
- Wiadomości — wymiana wiadomości z managerem
- Moja grupa — info o grupie, lektorze, harmonogramie (dostępne po ACTIVE)
- Obecności — lista zajęć i obecności dziecka
- Płatności — historia i status płatności

**UserPortal — propozycje grup (zakładka Proces zapisu, krok „Propozycja grupy”):**
- `GET /api/enrollment/status` — karty per `enrollment_request` (PROPOSED / NEGOTIATING / ACCEPTED / SIGNED)
- `GET /api/user/enrollment/proposals?enrollmentRequestId=` — historia (accordion: odrzucone/zaakceptowane, bez PENDING)
- **PROPOSED:** przyciski „Akceptuję” (`PUT /api/enrollment/accept`, body `{ requestId }`) i „Odrzucam” → textarea + `POST /api/enrollment/reject` (`{ enrollmentRequestId, rejectionComment? }`)
- **NEGOTIATING:** komunikat „Szkoła przygotuje nową propozycję” (bez przycisków decyzji)
- Blokada podwójnego kliknięcia: `enrollmentActionBusyRef` + `acceptingId` / `rejectingId`

**AdminPortal — zgłoszenia / modal „Zobacz szczegóły”:**
- GET `/api/admin/enrollment` — per dziecko: `proposalCount`, `hasPendingProposal`, statusy w tym **NEGOTIATING**
- `GET /api/admin/enrollment/proposals?enrollmentRequestId=` — timeline w `<details>` (od najnowszej)
- POST `/api/admin/enrollment` — dozwolone statusy zgłoszenia: NEW, REJECTED, **NEGOTIATING**; przy tabeli `enrollment_proposals`: transakcja INSERT PENDING + UPDATE PROPOSED; **409** jeśli już jest PENDING; odpowiedź z `proposalCount`
- Przycisk „Wyślij propozycję” **disabled** gdy `hasPendingProposal === true`
- Ostrzeżenie amber gdy `proposalCount >= 3` (limit miękki)

---

## 8. Enrollment flow

```
Formularz publiczny (zgloszenie) → wiersze w enrollment_requests (status=NEW, user_id=NULL, brak users/children)
  ↓
Manager klika "Wyślij propozycję dla dziecka" (POST /api/admin/enrollment)
  ↓
  - tworzy konto rodzica w `users` (PARENT, access_level=PROPOSED, confirmed=FALSE,
    must_change_password=TRUE) z tymczasowym hasłem `xxxx-9999` (4 litery + - + 4 cyfry)
  - jeśli konto już istnieje (były klient) — używa istniejącego, bez resetu hasła
  - tworzy klikane dziecko w `children` (active=TRUE, confirmed=FALSE, enrollment_request_id=…)
  - linkuje user_id we WSZYSTKICH pozostałych enrollment_requests tego rodzica (po emailu)
  - [gdy jest enrollment_proposals] INSERT enrollment_proposals (status=PENDING, proposed_by=JWT manager)
  - status enrollment_request → PROPOSED, proposed_group_id, proposed_at
  - wysyła mail z propozycją + (dla nowego konta) login + tymczasowe hasło + link do /portal/login
  ↓
Rodzic loguje się → portal wymusza zmianę hasła (/portal/zmien-haslo) jeśli must_change_password=TRUE
  ↓
Rodzic odrzuca propozycję (POST /api/enrollment/reject)
  → enrollment_proposals PENDING → REJECTED (+ rejection_comment, responded_at)
  → enrollment_requests → NEGOTIATING, proposed_group_id/proposed_at = NULL
  → mail sendProposalRejectedEmail do szkoły
  ↓
Manager wysyła kolejną propozycję (z NEGOTIATING → znowu PROPOSED + nowy wiersz PENDING)
  ↓
Rodzic akceptuje (PUT /api/enrollment/accept)
  → enrollment_proposals PENDING → ACCEPTED
  → enrollment_requests → ACCEPTED, umowa w contracts, mail z umową
  → users.access_level → CONTRACT_SENT tylko gdy brak innych PROPOSED (multi-child)
  ↓
Podpisanie umowy → ACTIVE
  ↓
Manager przypisuje dziecko do grupy → group_students
```

### Endpointy enrollment (skrót)

| Metoda | Ścieżka | Kto | Opis |
|--------|---------|-----|------|
| GET | `/api/admin/enrollment` | MANAGER/ADMIN | Lista rodziców + dzieci + `proposalCount` / `hasPendingProposal` |
| POST | `/api/admin/enrollment` | MANAGER/ADMIN | Wyślij propozycję (`requestId`, `groupId`) |
| GET | `/api/admin/enrollment/proposals` | MANAGER/ADMIN | Historia propozycji (`enrollmentRequestId`) |
| GET | `/api/user/enrollment/proposals` | PARENT | Jak admin, tylko własne zgłoszenia |
| GET | `/api/enrollment/status` | PARENT | Aktywne karty do UI |
| PUT | `/api/enrollment/accept` | PARENT | Akceptacja (`requestId` opcjonalne — multi-child) |
| POST | `/api/enrollment/reject` | PARENT | Odrzucenie (`enrollmentRequestId` lub `requestId`, `rejectionComment` lub `reason`) |

**Ważne:**
- Status `PENDING` na `users.access_level` zostaje wyłącznie dla rodziców utworzonych innymi ścieżkami (np. ręcznie w `/api/admin/users`). Z poziomu „Wyślij propozycję dla dziecka" konto powstaje od razu z `access_level=PROPOSED`.
- Dla dziecka klikanego tworzony jest 1 rekord w `children`. Pozostałe dzieci z tego samego zgłoszenia rodzica nadal czekają w `enrollment_requests` (mają już tylko podlinkowane `user_id`) i ich rekord w `children` powstanie dopiero gdy admin kliknie „Wyślij propozycję" dla każdego z nich osobno.
- Jeśli rodzic ma już `access_level` w (`CONTRACT_SENT`, `ACTIVE`) dla innego dziecka, kolejne propozycje **nie cofają** poziomu (UPDATE jest warunkowy).
- **Spójność danych:** UI rodzica (`/api/enrollment/status`) pokazuje PROPOSED na podstawie `enrollment_requests` + `proposed_group_id`. API reject/accept z tabelą `enrollment_proposals` wymaga wiersza **PENDING** (lub ścieżka „sierota” dla starych PROPOSED bez wiersza — do usunięcia po ręcznym sprzątaniu bazy). Po migracji: każde PROPOSED z `proposed_group_id` powinno mieć dokładnie jeden PENDING w `enrollment_proposals`.
- `lib/enrollment-status.ts` — typ `EnrollmentStatus` zawiera **NEGOTIATING**.

---

## 9. Harmonogram i zajecia

- `schedule_templates` — staly harmonogram grupy, zawiera `school_year_id`
- `lessons` — konkretne zajecia generowane z szablonu, zawiera `school_year_id`
- `group_students` — przypisania dzieci do grup, zawiera `school_year_id`
- Generowanie lekcji sprawdza school_holidays i pomija daty w okresach wolnych
- Walidacja konfliktow przy dodawaniu szablonu: nauczyciel i sala nie moga byc zajete w tym samym terminie

---

## 10. Soft-delete

- `users.active = FALSE` + `resignation_date = NOW()` — dziala dla TEACHER i PARENT
- `children.active = FALSE` + `resignation_date = NOW()`
- group_students: `left_at = NOW()` zamiast usuwania rekordu

---

## 11. Maile (nodemailer + Zoho)

Hosty z fallbackiem: smtppro.zoho.eu, smtppro.zoho.com, smtp.zoho.eu, smtp.zoho.com
Zmienne: `EMAIL_USER`, `EMAIL_PASS`

---

## 12. Zmienne srodowiskowe

```env
DATABASE_URL=        # Neon pooled connection
DIRECT_URL=          # Neon direct connection
EMAIL_USER=          # Zoho email
EMAIL_PASS=          # Zoho haslo
NEXT_PUBLIC_APP_URL= # URL aplikacji
SCHOOL_ID=           # UUID aktywnej szkoly (PROD lub DEV)
JWT_SECRET=          # Sekret JWT (wymagany — jose)
NODE_ENV=            # development / production
```

---

## 13. Planowane funkcjonalnosci (TODO)

- [ ] Portal dziecka (materialy, nagrody, avatar, powtorki)
- [ ] Portal nauczyciela (grupy, obecnosci, postepy)
- [~] Pelny enrollment flow — propozycja z historią (`enrollment_proposals`), akceptacja/odrzucenie przez rodzica, NEGOTIATING — gotowe; dane do umowy / podpisywanie — w czesci gotowe
- [ ] System platnosci — generowanie platnosci z umowy, historia platnosci
- [ ] Wiadomosci 1:1 — endpointy API dla tabeli messages
- [ ] Selector roku szkolnego w UI (admin, manager, nauczyciel, rodzic, dziecko)
- [ ] Endpointy z filtrowaniem po school_year_id
- [ ] Mail potwierdzajacy zgloszenie dziecka do rodzica (HTML template, Zoho SMTP)
- [ ] Aplikacje mobilne (Android, iOS) — Capacitor lub Expo
- [ ] Panel super admina (ADMIN) — zarzadzanie wieloma szkolami z wyborem szkoly w UI
- [ ] Multi-tenant UI (sprzedaz innym szkolom)
- [ ] Refresh token mechanizm
- [ ] Rate limiting na endpointach auth

---

## 14. Historia zmian

### Kwiecien 2026
- Nowa baza danych Neon z pelnym schematem 24 tabel
- Nowe repo GitHub i projekt Vercel
- System rol: UserRole enum → TEXT, dodano ADMIN i MANAGER
- Dodano access_level do users, confirmed i enrollment_request_id do children
- Dodano tabele: enrollment_requests, contract_templates, contracts, school_holidays, school_years
- Przebudowano AdminPortal.tsx

### Maj 2026
- Reset bazy — usunieto dane testowe
- ALTER TABLE users ALTER COLUMN school_id DROP NOT NULL (ADMIN ma NULL)
- ADD CONSTRAINT check_school_id — baza odrzuca brak school_id dla nie-ADMIN
- Dodano SCHOOL_ID do zmiennych srodowiskowych
- Dodano resolveAdminPanelTenant(userId) w lib/db.ts
- Utworzono szkoly PROD i DEV, konta systemowe
- Usunieto hardkodowane dane z aplikacji (opinie, FAQ, galeria → baza)
- Migracja auth: base64 token → JWT (jose), nowy plik lib/auth.ts
- Middleware weryfikuje JWT zamiast tylko sprawdzac obecnosc cookie
- Dezaktywacja nauczyciela przez managera (soft-delete przez DELETE endpoint)
- Dodano school_year_id do tabel: lessons, schedule_templates, group_students, contracts
- Setup dev/prod: repo GitHub branch `dev` + branch `main`, Vercel deployuje `main` na produkcje, `dev` jako preview
- SCHOOL_ID w Vercelu rozdzielone: Production = PROD school_id, Preview = DEV school_id
- Skopiowano lokalizacje ze szkoly PROD do szkoly DEV
- Zmieniono `enrollment_requests.status` z TEXT na ENUM PostgreSQL `enrollment_status` (wartosci: NEW, PROPOSED, ACCEPTED, SIGNED, COMPLETED, REJECTED), domyslna wartosc: NEW
- Dodano tabele `parent_profiles` — dodatkowe dane rodzica (adres, miasto, kod pocztowy) do uzupelnienia przed generowaniem umow. Rekord tworzony automatycznie przy rejestracji rodzica w transakcji razem z INSERT do users. Endpointy: GET/PUT /api/user/profile.
- Przepieto domene `harry-english.pl` ze starego projektu Vercel na `harry-english-v2`
- Zmieniono CNAME w home.pl na nowy adres Vercel (`9f12fb732c0af9a1.vercel-dns-017.com`)
- Wyłączono Vercel Authentication dla preview deploymentów (link dev dostepny publicznie)
- Dodano kolumne `rejection_comment TEXT` do tabeli `enrollment_requests`
- Dodano kolumny do tabeli `contracts`: `payment_type TEXT` (MONTHLY/ONE_TIME), `amount DECIMAL`, `payment_due_day INTEGER`
- Usunieto i odtworzono tabele `messages` i `payments` z poprawna struktura
- Nowa tabela `messages` — wiadomosci między rodzicem a managerem w aplikacji
- Nowa tabela `payments` — platnosci z pelna struktura (child_id, parent_id, contract_id, period_month, description)
- Nowa tabela `attendances` — obecnosci dzieci na zajęciach z constraint UNIQUE (lesson_id, child_id)
- Przygotowano czesc graficzna `UserPortal.tsx` — panel rodzica z zakladkami: Proces zapisu (stepper), Wiadomosci, Moja grupa, Obecnosci, Platnosci
- Zaprojektowano mail HTML potwierdzajacy zgloszenie dziecka do rodzica (prompt dla Cursora)
- W panelu admina (Harmonogram grupy) numer dnia tygodnia zamieniono na nazwy (1 → Poniedzialek, … 7 → Niedziela) — `src/components/AdminPortal.tsx`.
- Przebudowany flow „Wyslij propozycje dla dziecka" (POST /api/admin/enrollment):
  - usunieto wymog wczesniejszego konta rodzica (JOIN users) — endpoint obsluguje rodzicow z formularza publicznego (`enrollment_requests.user_id IS NULL`)
  - automatyczne utworzenie konta rodzica w `users` (PARENT, `access_level=PROPOSED`, `confirmed=FALSE`, `must_change_password=TRUE`) z tymczasowym haslem `xxxx-9999`
  - istniejacy rodzic (po `school_id + LOWER(email)`) jest reuzywany bez resetu hasla
  - tworzone jest TYLKO klikane dziecko w `children` (`active=TRUE`, `confirmed=FALSE`, `enrollment_request_id`)
  - wszystkie inne `enrollment_requests` tego rodzica dostaja `user_id` (kolejne klikniecia nie utworza duplikatu konta)
  - `users.access_level=PROPOSED` aktualizowane warunkowo — nie cofa rodzica, ktory ma juz `CONTRACT_SENT`/`ACTIVE` dla innego dziecka
  - `sendProposalEmail` — usunieto pole `priceMonthly` z payloadu, dodano przycisk CTA z linkiem do `/portal/login`, opcjonalny blok z loginem i tymczasowym haslem (tylko dla nowo utworzonego konta), informacja o imieniu dziecka
- Wymuszona zmiana hasla po pierwszym logowaniu:
  - nowa kolumna `users.must_change_password BOOLEAN NOT NULL DEFAULT FALSE` (migracja `sql/users_must_change_password.sql`)
  - dodano `userHasMustChangePassword` do `getDbShape()` w `lib/db.ts` — auto-detekcja kolumny
  - nowy plik `lib/password.ts`: `generateTempPassword()`, `validateStrongPassword()`, `PASSWORD_REQUIREMENTS_TEXT`
  - nowy endpoint `POST /api/auth/change-password` — sprawdza stare haslo (z fallbackiem `$2y$`), walidacja silnego nowego, zeruje flage
  - nowa strona `app/portal/zmien-haslo/page.tsx` — formularz: stare/nowe/powtorz
  - `POST /api/auth/login` zwraca `mustChangePassword` (root + `user.mustChangePassword`)
  - `GET /api/user/me` zwraca `user.mustChangePassword`
  - `AuthModal`, `app/portal/login/page.tsx`, `app/portal/page.tsx` przekierowuja na `/portal/zmien-haslo` jezeli flaga `true`
  - schema Prisma `User.mustChangePassword Boolean @default(false) @map("must_change_password")`
- Migracja: w produkcji nalezy uruchomic `sql/users_must_change_password.sql` (`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`). Kod dzieki `getDbShape()` dziala takze gdy kolumna jeszcze nie istnieje — flaga jest wtedy zawsze `false`.
- **Historia propozycji grup (`enrollment_proposals`):**
  - nowa tabela + ENUM `enrollment_status` rozszerzony o **NEGOTIATING** (ALTER ENUM w bazie — poza plikiem `sql/enrollment_proposals.sql`, do wykonania recznie)
  - `rejection_comment` przeniesiony z `enrollment_requests` do `enrollment_proposals` (Prisma: usuniete z `EnrollmentRequest`, dodane `EnrollmentProposal`)
  - `getDbShape().hasEnrollmentProposalsTable` — auto-detekcja tabeli
  - `lib/enrollment-proposals-list-sql.ts` — wspolne zapytanie listy (JOIN groups, users, schedule_templates, locations)
  - API: `POST /api/enrollment/reject`, `GET /api/admin/enrollment/proposals`, `GET /api/user/enrollment/proposals`; rozszerzone `POST/GET /api/admin/enrollment`, `PUT /api/enrollment/accept`, `GET /api/enrollment/status`
  - `AdminPortal.tsx`: timeline propozycji, blokada wysylki przy PENDING, ostrzezenie >= 3 propozycji
  - `UserPortal.tsx`: NEGOTIATING, reject z komentarzem, accordion historii
  - Po wdrozeniu: uruchomic `sql/enrollment_proposals.sql` + `npx prisma generate`; wyczyscic stare PROPOSED bez wiersza PENDING (recznie w DB)
