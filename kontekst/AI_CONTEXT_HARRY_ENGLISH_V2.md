# HarryEnglish v2 — Kontekst projektu dla AI

Ten plik służy do przekazania kontekstu do nowego czatu AI. Wklej go na początku rozmowy.

---

## Prompt startowy

"Pracujemy nad projektem Next.js `HarryEnglish v2` — aplikacją do zarządzania szkołą językową. Backend to route handlers w `app/api/`, baza to PostgreSQL (Neon) bez ORM (raw SQL przez `pg`). Baza ma 26 tabel. Auth bazuje na cookie `auth-token` (base64 `userId:timestamp`) — docelowo JWT. Portal `/portal` renderuje 5 ról: `ADMIN`, `MANAGER`, `TEACHER`, `PARENT`, `CHILD`. Kolumna role jest typu TEXT (nie enum). Rodzic po rejestracji ma `access_level = PENDING` — ograniczony dostęp do czasu podpisania umowy elektronicznej. Projekt jest multi-tenant — każda tabela ma `school_id`. school_id testowe = 566dfa03-b1ed-4ad1-a563-7df8e2b1b4c3 (Harry English Test, slug: harry-english-test). Potrzebuję zmian zgodnych z obecnym modelem. Najpierw przeanalizuj wpływ na tabele, endpointy API i komponenty portalu."

---

## 1. Stack technologiczny

- **Framework**: Next.js 16 App Router, React 19, TypeScript
- **Stylowanie**: Tailwind CSS v4
- **Baza**: PostgreSQL (Neon) — raw SQL przez pakiet `pg`, bez ORM
- **Auth**: cookie `auth-token` (base64 `userId:timestamp`), docelowo JWT
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
      children/route.ts            # NOWY
      children/[id]/route.ts       # NOWY
      groups/route.ts              # NOWY
      groups/[id]/route.ts         # NOWY
      schedule-templates/route.ts  # NOWY
      schedule-templates/[id]/route.ts  # NOWY
      group-students/route.ts      # NOWY
      group-students/[id]/route.ts # NOWY
      lessons/generate/route.ts    # NOWY
      enrollment/route.ts          # NOWY
    enrollment/
      accept/route.ts              # NOWY
      sign/route.ts                # NOWY
    user/
      me/route.ts
    students/
      add/route.ts
      resign/route.ts
    contact/route.ts

src/components/
  AdminPortal.tsx                  # Panel managera szkoly
  UserPortal.tsx                   # Portal rodzica (pelny dostep)
  PendingPortal.tsx                # Rodzic czeka na propozycje grupy
  ProposedPortal.tsx               # Rodzic akceptuje termin
  ContractPortal.tsx               # Rodzic podpisuje umowe
  TeacherPortal.tsx                # Portal nauczyciela (w budowie)
  ChildPortal.tsx                  # Portal dziecka (w budowie)

lib/
  db.ts                            # Polaczenie z baza + funkcje pomocnicze
  email.ts                         # Szablony maili i wysylka
middleware.ts                      # Ochrona /portal/* przez cookie
```

---

## 3. Multi-tenant i dane szkoly testowej

Kazda tabela zawiera `school_id`. Obecna szkola testowa:

```
school_id = 566dfa03-b1ed-4ad1-a563-7df8e2b1b4c3
name      = Harry English Test
slug      = harry-english-test
```

Konto managera testowego:
```
email = admin@harry-english.pl
rola  = MANAGER
haslo = test123 (tylko do testow!)
```

---

## 4. Model danych — wszystkie tabele (26)

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
| school_id | TEXT FK | Szkola |
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

ADMIN i MANAGER zawsze maja `access_level = ACTIVE`.

### children
Uczniowie — osobne encje od rodzicow.
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
Dane logowania dziecka (osobne od doroslych).
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| child_id | TEXT FK UNIQUE | Dziecko (ON DELETE CASCADE) |
| username | VARCHAR(100) UNIQUE | Login dziecka |
| password_hash | VARCHAR(255) | Hash bcrypt |
| last_login | TIMESTAMP | Ostatnie logowanie |

### locations
Sale i lokalizacje zajec.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| name | VARCHAR(255) | Nazwa lokalizacji |
| address | TEXT | Adres (opcjonalny) |
| active | BOOLEAN | Aktywna |

Lokalizacje Harry English: Panowki, Halemba, Orzegow, Kochlowice, Bielszowice.

### groups
Grupy zajeciowe.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| teacher_id | TEXT FK | Nauczyciel (users.id) |
| name | VARCHAR(255) | Nazwa grupy |
| level | VARCHAR(100) | Poziom (A1, A2, B1, B2, C1, C2) |
| max_students | INTEGER | Maks. liczba uczniow (domyslnie 12) |
| active | BOOLEAN | Aktywna |
| created_at | TIMESTAMP | Data utworzenia |

### group_students
Przypisanie dzieci do grup (many-to-many).
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| child_id | TEXT FK | Dziecko |
| enrolled_at | DATE | Data zapisania |
| left_at | DATE | Data opuszczenia (NULL = aktywny czlonek) |

UNIQUE: (group_id, child_id)

### schedule_templates
Staly tygodniowy harmonogram grupy (np. zawsze sroda 17:00).
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| location_id | TEXT FK | Lokalizacja |
| day_of_week | INTEGER | 1=poniedzialek, 7=niedziela |
| start_time | TIME | Godzina rozpoczecia |
| duration_min | INTEGER | Czas trwania w minutach (domyslnie 60) |

Jedna grupa moze miec wiele szablonow (np. wt i czw). Walidacja konfliktow:
- Nauczyciel nie moze miec dwoch grup w tym samym terminie
- Lokalizacja nie moze byc zajeta przez dwie grupy jednoczesnie

### lessons
Konkretne zajecia — tworzone z szablonu lub recznie.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| teacher_id | TEXT FK | Nauczyciel |
| location_id | TEXT FK | Lokalizacja |
| scheduled_at | TIMESTAMP | Data i godzina zajec |
| duration_min | INTEGER | Czas trwania |
| status | TEXT | SCHEDULED / COMPLETED / CANCELLED |
| notes | TEXT | Notatki |
| created_at | TIMESTAMP | Data utworzenia |

### attendance
Obecnosci uczniow na konkretnych zajeciach.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| lesson_id | TEXT FK | Zajecia |
| child_id | TEXT FK | Dziecko |
| status | TEXT | PRESENT / ABSENT / EXCUSED / LATE |
| note | TEXT | Notatka (opcjonalna) |

UNIQUE: (lesson_id, child_id)

### materials
Materialy edukacyjne.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| uploaded_by | TEXT FK | Autor (users.id) |
| title | VARCHAR(255) | Tytul |
| type | TEXT | PDF / VIDEO / AUDIO / IMAGE / LINK / EXERCISE |
| url | TEXT | Link do materialu |
| level | VARCHAR(100) | Poziom zaawansowania |
| created_at | TIMESTAMP | Data dodania |

### group_materials
Materialy przypisane do grupy.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| group_id | TEXT FK | Grupa |
| material_id | TEXT FK | Material |
| assigned_at | TIMESTAMP | Data przypisania |

UNIQUE: (group_id, material_id)

### progress_notes
Notatki nauczyciela o postepach ucznia.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| child_id | TEXT FK | Dziecko |
| teacher_id | TEXT FK | Nauczyciel |
| lesson_id | TEXT FK | Zajecia (opcjonalne) |
| note | TEXT | Tresc notatki |
| rating | INTEGER | Ocena 1-5 (opcjonalna) |
| created_at | TIMESTAMP | Data dodania |

### subscriptions
Subskrypcje miesieczne (rodzic -> dziecko -> grupa).
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| parent_id | TEXT FK | Rodzic |
| child_id | TEXT FK | Dziecko |
| group_id | TEXT FK | Grupa |
| status | TEXT | ACTIVE / PAUSED / CANCELLED / EXPIRED |
| price_cents | INTEGER | Cena w groszach (np. 15000 = 150 zl) |
| billing_period | VARCHAR | MONTHLY |
| valid_from | DATE | Poczatek subskrypcji |
| valid_to | DATE | Koniec (NULL = aktywna) |
| created_at | TIMESTAMP | Data utworzenia |

### payments
Konkretne platnosci powiazane z subskrypcja.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| subscription_id | TEXT FK | Subskrypcja |
| amount_cents | INTEGER | Kwota w groszach |
| currency | VARCHAR(10) | PLN |
| status | TEXT | PENDING / PAID / OVERDUE / CANCELLED |
| method | VARCHAR(100) | Metoda platnosci |
| paid_at | TIMESTAMP | Data zaplaty |
| due_at | TIMESTAMP | Termin platnosci |
| created_at | TIMESTAMP | Data utworzenia |

### messages
Wiadomosci 1:1 miedzy uzytkownikami.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| sender_id | TEXT FK | Nadawca (users.id) |
| recipient_id | TEXT FK | Odbiorca (users.id) |
| subject | VARCHAR(255) | Temat |
| body | TEXT | Tresc |
| read | BOOLEAN | Przeczytana |
| created_at | TIMESTAMP | Data wyslania |

### announcements
Ogloszenia broadcast do roli lub wszystkich.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| author_id | TEXT FK | Autor (users.id) |
| title | VARCHAR(255) | Tytul |
| body | TEXT | Tresc |
| target_role | VARCHAR(50) | MANAGER/TEACHER/PARENT/null (wszyscy) |
| published_at | TIMESTAMP | Data publikacji |
| expires_at | TIMESTAMP | Data wygasniecia (opcjonalna) |

### rewards
Definicje nagrod w systemie XP.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| name | VARCHAR(255) | Nazwa nagrody |
| type | TEXT | AVATAR / BADGE / ITEM |
| xp_cost | INTEGER | Koszt w XP |
| asset_url | TEXT | URL grafiki |

### child_rewards
Nagrody zdobyte przez dziecko.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| child_id | TEXT FK | Dziecko |
| reward_id | TEXT FK | Nagroda |
| earned_at | TIMESTAMP | Data zdobycia |

### enrollment_requests
Zgloszenia wstepne przed zalozeniem konta przez rodzica.
| Kolumna | Typ | Opis |
|---------|-----|------|
| id | TEXT PK | UUID |
| school_id | TEXT FK | Szkola |
| parent_first_name | VARCHAR(100) | Imie rodzica |
| parent_last_name | VARCHAR(100) | Nazwisko rodzica |
| parent_email | VARCHAR(255) | Email rodzica |
| parent_phone | VARCHAR(50) | Telefon (opcjonalny) |
| child_first_name | VARCHAR(100) | Imie dziecka |
| child_last_name | VARCHAR(100) | Nazwisko dziecka |
| child_birth_date | DATE | Data urodzenia dziecka |
| preferred_location | VARCHAR(100) | Preferowana lokalizacja |
| preferred_days | TEXT | Preferowane dni/godziny |
| notes | TEXT | Uwagi |
| status | TEXT | NEW / PROPOSED / ACCEPTED / SIGNED / COMPLETED |
| proposed_group_id | TEXT FK | Proponowana grupa (groups.id) |
| proposed_at | TIMESTAMP | Data propozycji managera |
| accepted_at | TIMESTAMP | Data akceptacji przez rodzica |
| contract_signed | BOOLEAN | Umowa podpisana |
| contract_signed_at | TIMESTAMP | Data podpisania umowy |
| user_id | TEXT FK | Konto rodzica (po rejestracji) |
| created_at | TIMESTAMP | Data zgloszenia |

### contract_templates
Szablony umow z placeholderami.
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
Wygenerowane i podpisane umowy.
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
| sent_at | TIMESTAMP | Data wyslania do rodzica |
| signed_at | TIMESTAMP | Data podpisania |
| signed_ip | TEXT | IP rodzica przy podpisaniu |
| created_at | TIMESTAMP | Data wygenerowania |

---

## 5. Role i dostep

Kolumna `role` w tabeli `users` jest typu TEXT — role mozna dodawac bez migracji bazy.

| Rola | Opis | access_level |
|------|------|-------------|
| ADMIN | Super admin, wszystkie szkoly | zawsze ACTIVE |
| MANAGER | Zarzadca konkretnej szkoly | zawsze ACTIVE |
| TEACHER | Nauczyciel | zawsze ACTIVE |
| PARENT | Rodzic | PENDING / PROPOSED / CONTRACT_SENT / ACTIVE |
| CHILD | Dziecko (loguje sie przez child_auth) | n/d |

---

## 6. Auth i autoryzacja

- Logowanie doroslych: email + haslo → cookie `auth-token` (base64 `userId:timestamp`)
- Logowanie dzieci: username + haslo → osobny endpoint, osobne cookie
- Middleware: sprawdza obecnosc cookie dla `/portal/*`
- Docelowo: JWT z podpisem

### Portal routing (app/portal/page.tsx)
```
role = ADMIN lub MANAGER → AdminPortal
role = TEACHER → TeacherPortal
role = PARENT:
  access_level = PENDING → PendingPortal (czekamy na kontakt)
  access_level = PROPOSED → ProposedPortal (propozycja grupy)
  access_level = CONTRACT_SENT → ContractPortal (umowa do podpisania)
  access_level = ACTIVE → UserPortal (pelny dostep)
role = CHILD → ChildPortal
```

---

## 7. Enrollment flow (przepływ zapisu dziecka)

```
Rejestracja rodzica → PENDING → Manager proponuje grupe → PROPOSED
→ Rodzic akceptuje termin → CONTRACT_SENT → Podpisanie umowy → ACTIVE
```

1. Rodzic rejestruje sie: `users` (PARENT, access_level=PENDING), `children` (confirmed=FALSE)
2. Manager widzi nowych rodzicow bez grupy → proponuje grupe → access_level=PROPOSED
3. Rodzic loguje sie, widzi propozycje → akceptuje → access_level=CONTRACT_SENT
4. System generuje umowe z `contract_templates`, podmienia placeholdery, zapisuje w `contracts` (status=SENT), wysyla mailem
5. Rodzic klika "Akceptuje warunki" → `contracts.status=SIGNED`, `children.confirmed=TRUE`, `users.access_level=ACTIVE`
6. Manager i rodzic dostaja kopie umowy mailem
7. Manager przypisuje dziecko do grupy → `group_students`

---

## 8. Harmonogram i zajecia

- `schedule_templates` — staly harmonogram grupy (np. sroda 17:00, Panowki, 60 min)
- Jedna grupa moze miec wiele szablonow (np. wt i czw = 2 rekordy)
- `lessons` — konkretne zajecia generowane z szablonu lub dodawane recznie
- Generowanie: manager klika "Generuj zajecia" → podaje zakres dat → system tworzy rekordy w `lessons`
- Walidacja konfliktow przy dodawaniu szablonu: sprawdz czy nauczyciel i sala nie sa juz zajete w tym terminie

---

## 9. Soft-delete

- `users.active = FALSE` + `resignation_date = NOW()` — usuwa tez dzieci
- `children.active = FALSE` + `resignation_date = NOW()` — jesli ostatnie dziecko, usuwa rodzica
- Przywrocenie dziecka → jesli rodzic byl nieaktywny, przywroc rodzica
- group_students: `left_at = NOW()` zamiast usuwania rekordu

---

## 10. Maile (nodemailer + Zoho)

Hosty z fallbackiem: smtppro.zoho.eu, smtppro.zoho.com, smtp.zoho.eu, smtp.zoho.com
Zmienne: `EMAIL_USER`, `EMAIL_PASS`

Szablony w lib/email.ts:
- sendWelcomeEmail — po rejestracji rodzica
- sendPasswordResetEmail — reset hasla
- sendResignationEmail — rezygnacja dziecka
- sendProposalEmail — propozycja grupy do rodzica (TODO)
- sendContractEmail — umowa do podpisania (TODO)
- sendSignedContractEmail — kopia podpisanej umowy (TODO)

---

## 11. Zmienne srodowiskowe

```env
DATABASE_URL=        # Neon pooled connection
DIRECT_URL=          # Neon direct connection
EMAIL_USER=          # Zoho email
EMAIL_PASS=          # Zoho haslo
NEXT_PUBLIC_APP_URL= # URL aplikacji
JWT_SECRET=          # Sekret JWT (do wdrozenia)
NODE_ENV=            # development / production
```

---

## 12. Planowane funkcjonalnosci (TODO)

- [ ] Portal dziecka (materialy, nagrody, avatar, powtorki)
- [ ] Portal nauczyciela (grupy, obecnosci, postepy)
- [ ] Pelny enrollment flow (ProposedPortal, ContractPortal, podpisywanie umow)
- [ ] System platnosci (subskrypcje, historia platnosci)
- [ ] Wiadomosci 1:1 i ogloszenia
- [ ] Generowanie lekcji z harmonogramu tygodniowego
- [ ] Walidacja konfliktow harmonogramu
- [ ] Aplikacje mobilne (Android, iOS) — Capacitor lub Expo
- [ ] JWT zamiast base64 token
- [ ] Panel super admina (ADMIN) — zarzadzanie wieloma szkolami
- [ ] Multi-tenant UI (sprzedaz innym szkolom)

---

## 13. Historia zmian (kwiecien 2026)

- Nowa baza danych Neon (harry-english-v2_db) z pelnym schematem 26 tabel
- Nowe repo GitHub (harry-english-v2) i projekt Vercel
- Zainstalowano Prisma (nieuzywana — baza obslugiwana przez raw SQL pg)
- Zmieniono system rol: UserRole enum → TEXT, dodano ADMIN (super admin) i MANAGER (zarzadca szkoly)
- Dodano kolumne access_level do users (PENDING/PROPOSED/CONTRACT_SENT/ACTIVE)
- Dodano kolumny confirmed i enrollment_request_id do children
- Dodano tabele: enrollment_requests, contract_templates, contracts
- Przebudowano AdminPortal.tsx: topbar, nawigacja pozioma, dolna nawigacja mobile, dashboard z kartami statystyk
- Dodano lokalizacje do bazy: Panowki, Halemba, Orzegow, Kochlowice, Bielszowice
- Szkola testowa: name=Harry English Test, slug=harry-english-test
