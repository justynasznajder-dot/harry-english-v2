# HarryEnglish v2 — Kontekst projektu dla AI

Ten plik służy do przekazania kontekstu do nowego czatu AI. Wklej go na początku rozmowy.

---

## Prompt startowy

"Pracujemy nad projektem Next.js `HarryEnglish v2` — aplikacją do zarządzania szkołą językową. Backend to route handlers w `app/api/`, baza to PostgreSQL (Neon) bez ORM (raw SQL przez `pg`). Baza ma 25 tabel. Auth bazuje na JWT (jose) — cookie `auth-token` zawiera podpisany token z polami userId, role, schoolId, accessLevel. Portal `/portal` renderuje 5 ról: `ADMIN`, `MANAGER`, `TEACHER`, `PARENT`, `CHILD`. Kolumna role jest typu TEXT (nie enum). Rodzic po rejestracji ma `access_level = PENDING` — ograniczony dostęp do czasu podpisania umowy elektronicznej. Projekt jest multi-tenant — każda tabela ma `school_id`. ADMIN (superadmin) ma `school_id = NULL` i widzi wszystkie szkoły. MANAGER ma `school_id` swojej szkoły i widzi tylko jej dane. school_id PROD = c93d5ac1-fa59-497f-b450-a4e50e1fb50d (Harry English, slug: harry-english). school_id DEV = efcb641a-e5bd-4e59-aa39-c08fd1b318e9 (Harry English Test, slug: harry-english-test). Potrzebuję zmian zgodnych z obecnym modelem. Najpierw przeanalizuj wpływ na tabele, endpointy API i komponenty portalu."

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
    page.tsx                       # Router widoku wg roli i access_level
  api/
    auth/
      login/route.ts
      logout/route.ts
      register/route.ts
      forgot-password/route.ts
      reset-password/route.ts
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
      enrollment/route.ts
      school-years/route.ts
      school-years/[id]/route.ts
      school-holidays/route.ts
      school-holidays/[id]/route.ts
    enrollment/
      accept/route.ts
      sign/route.ts
      status/route.ts
    user/
      me/route.ts                  # zwraca schoolId (null dla ADMIN)
      profile/route.ts             # GET/PUT danych parent_profiles
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
  email.ts                         # Szablony maili i wysylka
middleware.ts                      # Ochrona /portal/* — weryfikacja JWT
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

## 5. Model danych — wszystkie tabele (24)

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

### materials, group_materials, progress_notes, subscriptions, payments, messages, announcements, rewards, child_rewards
Tabele modułów: materiały edukacyjne, postępy, płatności, wiadomości, nagrody — szczegóły bez zmian od v9.

### enrollment_requests
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| status | enrollment_status (ENUM) | NEW / PROPOSED / ACCEPTED / SIGNED / COMPLETED / REJECTED |
| proposed_group_id | TEXT FK | Proponowana grupa |
| user_id | TEXT FK | Konto rodzica (po rejestracji) |
| created_at | TIMESTAMP | Data zgloszenia |

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

### Portal routing (app/portal/page.tsx)
```
role = ADMIN lub MANAGER → AdminPortal
role = TEACHER → TeacherPortal
role = PARENT:
  access_level = PENDING → PendingPortal
  access_level = PROPOSED → ProposedPortal
  access_level = CONTRACT_SENT → ContractPortal
  access_level = ACTIVE → UserPortal
role = CHILD → ChildPortal
```

---

## 8. Enrollment flow

```
Rejestracja rodzica → PENDING → Manager proponuje grupe → PROPOSED
→ Rodzic akceptuje termin → CONTRACT_SENT → Podpisanie umowy → ACTIVE
→ Manager przypisuje dziecko do grupy → group_students
```

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
- [ ] Pelny enrollment flow (ProposedPortal, ContractPortal, podpisywanie umow)
- [ ] System platnosci (subskrypcje, historia platnosci)
- [ ] Wiadomosci 1:1 i ogloszenia
- [ ] Selector roku szkolnego w UI (admin, manager, nauczyciel, rodzic, dziecko)
- [ ] Endpointy z filtrowaniem po school_year_id
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
