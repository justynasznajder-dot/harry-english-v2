# Raport: zużycie Vercel Functions Storage — HarryEnglish v2

**Data:** 2026-09-10  
**Zakres:** tylko analiza lokalnych artefaktów `.next` (NFT / file tracing).  
**Bez zmian w kodzie, konfiguracji, zależnościach, bez deployu.**  
**Metryka:** suma rozmiarów plików wskazanych w `route.js.nft.json` (to, co Next/Vercel pakuje do danej funkcji). Rozmiary są **sumowane per funkcja** — ten sam plik w N funkcjach liczy się N razy (tak działa Functions Storage).

---

## 1. Inwentarz funkcji

| Typ | Liczba (lokalny build) |
|---|---:|
| API routes (`app/api/**/route.js.nft.json`) | **126** |
| Pozostałe NFT w `app/` (page/layout/og) | **16** |
| Razem NFT w `app/` | **142** |

Vercel „~130 Functions” ≈ te 126 API (+ ewentualnie middleware / edge / inne). Główną masę storage generują **API routes**.

**Suma śledzonych plików API (naive):** **~1455 MB**  
Mediana funkcji: **~1,36 MB** · 89 funkcji **&lt; 2 MB** · 5 funkcji **&gt; 100 MB**

---

## 2–4. Tabela: największe funkcje (posortowane)

Skróty: **Chr** = sparticuz/puppeteer w NFT · **BR** = binaria `.br` Chromium · **IMG** = `public/images`

### Warstwa A — ≥100 MB (5 funkcji ≈ **552 MB** łącznie)

| ROUTE | SZAC. MB | NAJCIĘŻSZE DEPENDENCIES | CHR/PUP | POWÓD |
|---|---:|---|:---:|---|
| `/api/enrollment/sign` | **110,4** | `@sparticuz/chromium` 65,3 · `typescript` 18,9 · `public/images` 19,4 · puppeteer-core | TAK+BR | PDF umowy + mail |
| `/api/admin/invoices/generate-monthly` | **110,3** | j.w. | TAK+BR | `invoicing` → PDF faktur + includes |
| `/api/accountant/invoices/corrective/preview` | **110,3** | j.w. | TAK+BR | import `invoicing` (preview **bez** PDF) + includes dziedziczone |
| `/api/accountant/invoices/corrective` | **110,3** | j.w. | TAK+BR | PDF korekty + includes |
| `/api/cron/monthly-invoices` | **110,3** | j.w. | TAK+BR | cron faktur + includes |

### Warstwa B — ~45 MB (9 funkcji ≈ **406 MB**) — Puppeteer/TS **bez** binów + często images

| ROUTE | SZAC. MB | NAJCIĘŻSZE | CHR/PUP | POWÓD |
|---|---:|---|:---:|---|
| `/api/admin/discounts` | 45,2 | typescript 18,9 · images 19,4 · puppeteer* | TAK | `invoicing` (ustawienia dnia faktur) |
| `/api/admin/invoices` | 45,1 | j.w. | TAK | **tylko stałe stringowe** z `invoicing` |
| `/api/admin/lesson-billing/generate-invoices` | 45,1 | j.w. | TAK | generowanie faktur PDF (brak includes → **bez** `.br`) |
| `/api/admin/invoices/generate-yearly` | 45,1 | j.w. | TAK | PDF roczne (brak includes) |
| `/api/admin/lesson-billing/[id]/invoice` | 45,1 | j.w. | TAK | includes w config **nie dokłada binów** (dynamic route) |
| `/api/admin/invoices/holds` | 45,1 | j.w. | TAK | holdy — bez PDF |
| `/api/admin/invoices/yearly-preview` | 45,1 | j.w. | TAK | preview HTML |
| `/api/admin/invoices/monthly-preview` | 45,1 | j.w. | TAK | preview HTML |
| `/api/accountant/invoices/held` | 45,1 | j.w. | TAK | held — bez PDF |

### Warstwa C — ~24–26 MB (PDF bez images)

| ROUTE | MB | CHR/PUP | POWÓD |
|---|---:|:---:|---|
| `/api/parent/pickup-consent/generate` | 25,5 | TAK | `complimentary-pickup-consent` → `contract-pdf` |
| `/api/parent/contract/preview-pdf` | 24,2 | TAK | bezpośredni `renderHtmlToPdf` (**brak** `.br` w NFT!) |

### Warstwa D — ~21 MB (głównie `public/images` przez email)

| ROUTE | MB | IMG | POWÓD |
|---|---:|:---:|---|
| `/api/admin/enrollment` (+ batch, group-change-notify) | ~21 | TAK | `lib/email` |
| `/api/admin/school-holidays` | 21,0 | TAK | `parent-notifications` → `email` |
| `/api/admin/lessons/[id]/cancel` | 21,0 | TAK | `parent-notifications` → `email` |
| `/api/messages`, `/api/parent/enrollment`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/contact`, `/api/children/resign`, `/api/user/profile/change-request`, `/api/dev/email-preview` | ~20,7–21,0 | TAK | import `lib/email` |

### Warstwa E — reszta (~97 funkcji ≈ **175 MB**)

Większość **~1,3 MB** (głównie `next` + `pg`). Trzy wyjątki ~13,9 MB (duży chunk serwerowy przy matchowaniu przelewów).

### Pełna lista API (CSV z pomiaru NFT)

```
route,mb,spart,br,images,chromiumMB,imagesMB,awsMB,tsMB,top1
/api/enrollment/sign,110.374,1,1,1,66.4,19.39,1.21,18.922,@sparticuz/chromium:65.3MB
/api/admin/invoices/generate-monthly,110.341,1,1,1,66.4,19.39,1.21,18.922,@sparticuz/chromium:65.3MB
/api/accountant/invoices/corrective/preview,110.339,1,1,1,66.4,19.39,1.21,18.922,@sparticuz/chromium:65.3MB
/api/accountant/invoices/corrective,110.339,1,1,1,66.4,19.39,1.21,18.922,@sparticuz/chromium:65.3MB
/api/cron/monthly-invoices,110.315,1,1,1,66.4,19.39,1.21,18.922,@sparticuz/chromium:65.3MB
/api/admin/discounts,45.161,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/invoices,45.107,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/lesson-billing/generate-invoices,45.106,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/invoices/generate-yearly,45.106,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/lesson-billing/[id]/invoice,45.106,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/invoices/holds,45.106,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/invoices/yearly-preview,45.105,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/admin/invoices/monthly-preview,45.105,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/accountant/invoices/held,45.105,1,0,1,1.17,19.39,1.21,18.922,typescript:18.9MB
/api/parent/pickup-consent/generate,25.506,1,0,0,1.17,0,1.21,18.922,typescript:18.9MB
/api/parent/contract/preview-pdf,24.189,1,0,0,1.17,0,0,18.922,typescript:18.9MB
/api/admin/enrollment,21.073,0,0,1,0,19.39,0,0,next:0.9MB
/api/admin/enrollment/batch,21.042,0,0,1,0,19.39,0,0,next:0.9MB
/api/admin/enrollment/group-change-notify,21.036,0,0,1,0,19.39,0,0,next:0.9MB
/api/admin/school-holidays,21.017,0,0,1,0,19.39,0,0,next:0.9MB
/api/admin/lessons/[id]/cancel,21.006,0,0,1,0,19.39,0,0,next:0.9MB
/api/messages,20.988,0,0,1,0,19.39,0,0,next:0.9MB
/api/parent/enrollment,20.97,0,0,1,0,19.39,0,0,next:0.9MB
/api/user/profile/change-request,20.967,0,0,1,0,19.39,0,0,next:0.9MB
/api/children/resign,20.966,0,0,1,0,19.39,0,0,next:0.9MB
/api/auth/register,20.949,0,0,1,0,19.39,0,0,next:0.9MB
/api/auth/forgot-password,20.944,0,0,1,0,19.39,0,0,next:0.9MB
/api/contact,20.735,0,0,1,0,19.39,0,0,next:0.9MB
/api/dev/email-preview,20.732,0,0,1,0,19.39,0,0,next:0.9MB
/api/admin/invoices/verify-payments,13.911,0,0,0,0,0,0,0,next:0.9MB
/api/admin/invoices/manual-match,13.91,0,0,0,0,0,0,0,next:0.9MB
/api/admin/invoices/unmatched-transfers,13.91,0,0,0,0,0,0,0,next:0.9MB
```

Pozostałe ~95 API routes: zwykle **1,1–1,5 MB** (bez Chromium, bez `public/images`).

---

## 5. Funkcje wg kategorii ciężkich artefaktów

### `@sparticuz/chromium` — **16** funkcji

Wszystkie z warstw A–C.

### `puppeteer` + `puppeteer-core` — **te same 16**

Oba branchy z `lib/contract-pdf.ts` są w NFT (serverless i local), mimo że na Vercel używany jest tylko `puppeteer-core`.

### Pliki `*.br` Chromium — **tylko 5** funkcji

`chromium.br` (60,66 MB) + `swiftshader.tar.br` + `al2023.tar.br` + `fonts.tar.br` ≈ **65,19 MB × 5 = 325,9 MB** storage.

Funkcje z `.br`:

1. `/api/enrollment/sign`
2. `/api/admin/invoices/generate-monthly`
3. `/api/accountant/invoices/corrective`
4. `/api/accountant/invoices/corrective/preview`
5. `/api/cron/monthly-invoices`

### Duże fonty aplikacji

Brak istotnych `.woff/.ttf` w ciężkich NFT. `fonts.tar.br` to fonty **wewnątrz pakietu Chromium**, nie fonty strony.

### `public/images` — **27** funkcji × **19,39 MB** = **~523,5 MB**

Cały katalog (59 plików, w tym `gallery/`, `teachers/` itd.), nie tylko 5 PNG do maili.

### TypeScript runtime — **16** funkcji × **~18,9 MB** = **~302,8 MB**

W NFT m.in. `typescript/lib/typescript.js` (8,69 MB), `_tsc.js` (5,93 MB), lokalizacje diagnostyk.  
Ścieżka: `puppeteer` → `cosmiconfig` (opcjonalny loader TS) → cały pakiet `typescript` (devDependency) trafia do tracing.

### Pojedyncze pliki &gt; 5 MB

| Plik | MB | × funkcji | Wkład (MB) |
|---|---:|---:|---:|
| `@sparticuz/chromium/bin/chromium.br` | 60,66 | 5 | **303,3** |
| `typescript/lib/typescript.js` | 8,69 | 16 | **139,0** |
| `typescript/lib/_tsc.js` | 5,93 | 16 | **94,9** |
| chunk `[root-of-the-server]__6124f92d._.js` | 11,89 | 3 | **35,7** |

---

## 6. Łańcuchy importów (Chromium / Puppeteer)

### Centralny launcher (`lib/contract-pdf.ts`)

```
launchPdfBrowser()
  ├── [VERCEL] await import("@sparticuz/chromium")     // linie 74–81
  ├── [VERCEL] await import("puppeteer-core")
  └── [local]  await import("puppeteer")               // linie 86–90
```

Statyczny import `renderHtmlToPdf` / `buildSignedContractPdfFiles` wystarczy, by NFT dołączył te dynamiczne cele (+ transitive: cosmiconfig → typescript, proxy-agent, …).

---

### `/api/enrollment/sign` (potrzebuje PDF)

```
app/api/enrollment/sign/route.ts
  L19: import { buildSignedContractPdfFiles } from "@/lib/contract-pdf"
  L5:  import { sendSignedContractConfirmationEmails } from "@/lib/email"
       → public/images (fs + path.join(process.cwd(),"public","images"))
  + next.config outputFileTracingIncludes → całe @sparticuz/chromium/**
```

---

### `/api/cron/monthly-invoices`

```
route.ts
  L2: import { generateAllMonthlyInvoices } from "@/lib/invoicing"
        L9:  import { renderHtmlToPdf } from "@/lib/contract-pdf"   ← PDF
        L11: import { sendInvoiceNotificationEmail } from "@/lib/email" ← images
        → puppeteer* / @sparticuz
  + outputFileTracingIncludes → biny .br
```

---

### `/api/admin/invoices/generate-monthly`

```
route.ts
  L8: import { generateMonthlyInvoicesForSchool } from "@/lib/invoicing"
        → contract-pdf → chromium/puppeteer
        → email → public/images
  + outputFileTracingIncludes → biny .br
```

---

### `/api/accountant/invoices/corrective`

```
route.ts
  L4: import { createCorrectiveInvoice } from "@/lib/invoicing"
        → renderHtmlToPdf (linia ~2350 w invoicing.ts)
        → email
  + outputFileTracingIncludes → biny .br
```

---

### `/api/accountant/invoices/corrective/preview` ⚠️ zbędne Chromium+biny

```
route.ts
  L4: import { previewCorrectiveInvoice } from "@/lib/invoicing"
        previewCorrectiveInvoice → tylko HTML (bez renderHtmlToPdf)
        ALE cały moduł invoicing.ts statycznie importuje contract-pdf + email
  + klucz includes "/api/accountant/invoices/corrective" obejmuje też /preview
    → pełne chromium.br mimo braku generowania PDF
```

---

### Przykłady „lekkiego” importu ciągnącego PDF

```
/api/admin/invoices
  L5–9: import { INVOICE_DESC_* } from "@/lib/invoicing"
        → cały invoicing → contract-pdf → puppeteer+typescript
        → email → 19 MB images
  (funkcja tylko listuje faktury — nie generuje PDF)

/api/admin/discounts
  L7–12: get/setSchoolInvoiceGenerationDay from "@/lib/invoicing"
        → ten sam łańcuch (~45 MB)
```

---

### Email → images (bez PDF)

```
lib/email.ts
  L6:  EMAIL_IMAGES_DIR = path.join(process.cwd(), "public", "images")
  L16–31: fs.existsSync + path do plików PNG
→ Next file tracing dołącza CAŁY katalog public/images (19,39 MB),
  choć runtime używa tylko 5 plików (~0,66 MB).
```

Łańcuch pośredni: `parent-notifications.ts` → `email` (school-holidays, cancel lekcji).

---

## 7. Szczegółowo: 5 wskazanych funkcji

| Funkcja | MB | .br | images | Czy PDF w runtime? | Werdykt |
|---|---:|:---:|:---:|:---:|---|
| `enrollment/sign` | 110,4 | TAK | TAK | TAK | uzasadnione + includes |
| `cron/monthly-invoices` | 110,3 | TAK | TAK | TAK | uzasadnione + includes |
| `admin/invoices/generate-monthly` | 110,3 | TAK | TAK | TAK | uzasadnione + includes |
| `accountant/.../corrective` | 110,3 | TAK | TAK | TAK | uzasadnione + includes |
| `accountant/.../corrective/preview` | 110,3 | TAK | TAK | **NIE** | **zbędne ~110 MB** (moduł + includes) |

---

## 8. Współdzielone moduły „zarażające” funkcje

| Moduł | Co wciąga | Skutek |
|---|---|---|
| `lib/invoicing.ts` | statycznie `contract-pdf` + `email` + R2 | każda funkcja z dowolnym symbolem z invoicing → Puppeteer+TS (+ często images) |
| `lib/contract-pdf.ts` | dynamic puppeteer/chromium | 16 funkcji |
| `lib/email.ts` | `public/images` via cwd+fs | **27** funkcji × 19,39 MB |
| `lib/complimentary-pickup-consent.ts` | `renderHtmlToPdf` | pickup-consent/generate |
| `lib/parent-notifications.ts` | `email` | holidays/cancel ≈ 21 MB |

---

## 9. `next.config.ts`

```ts
serverExternalPackages: [@aws-sdk/client-s3, @sparticuz/chromium, puppeteer, puppeteer-core, ...]
outputFileTracingIncludes: {
  "/api/enrollment/sign": chromium/**,
  "/api/cron/monthly-invoices": ...,
  "/api/admin/invoices/generate-monthly": ...,
  "/api/admin/lesson-billing/[id]/invoice": ...,  // nieskuteczne dla binów
  "/api/accountant/invoices/corrective": ...,     // obejmuje też /preview
}
// BRAK outputFileTracingExcludes
```

**Wpływ:**

1. Includes **celowo** dokładają ~65 MB binów do wybranych funkcji — bez tego PDF pada na Vercel.
2. Klucz `.../corrective` **rozszerza** biny na `.../corrective/preview` (zbędne).
3. Klucz z `[id]` **nie dokłada** binów do `lesson-billing/[id]/invoice` (NFT bez `.br`).
4. Brak excludes → typescript (~19 MB) i cały `public/images` nie są odcinane.
5. `serverExternalPackages` nie zmniejsza Functions Storage — pakiety i tak są w tracing.

---

## 10. `public/images` w functions — **TAK**

| Fakt | Wartość |
|---|---|
| Rozmiar katalogu | **19,39 MB** / 59 plików |
| Liczba funkcji z images w NFT | **27** |
| Wkład w storage | **~523,5 MB** (~36% z 1455 MB) |
| Przyczyna | `lib/email.ts`: `path.join(process.cwd(),"public","images")` + `fs.existsSync` |
| Rzeczywiste użycie maili | 5 PNG ≈ **0,66 MB** |
| W NFT jest też | `gallery/`, `teachers/`, zbędne assety strony |

To **większy** wkład niż Chromium biny (523 vs 326 MB w sumie per-function).

---

## 11. Dependencies powielane mimo wąskiego użycia

| Artefakt | Unikalny rozmiar | × kopii | Wkład storage |
|---|---:|---:|---:|
| Chromium bins (`.br`) | ~65 MB | 5 | ~326 MB |
| Cały `public/images` | ~19,4 MB | 27 | ~524 MB |
| `typescript` (przez cosmiconfig/puppeteer) | ~18,9 MB | 16 | ~303 MB |
| `puppeteer-core` + browsers (JS) | ~1–2 MB | 16 | ~20–30 MB |
| AWS SDK (fragmenty) | ~1,2 MB | wiele (R2) | ~24 MB sumarycznie |

---

## 12. Szacunek łącznego storage jednego deploymentu (API)

| Kategoria (suma per-function) | MB | % z 1455 |
|---|---:|---:|
| **public/images** | **523,5** | **36%** |
| **Chromium `.br` biny** | **325,9** | **22%** |
| **typescript** (przyczepiony do PDF stack) | **302,8** | **21%** |
| Puppeteer JS (@sparticuz JS + puppeteer*) poza binami | ~19 | ~1% |
| AWS SDK / R2 | ~24 | ~2% |
| Reszta (next, pg, chunki, kod aplikacji) | ~260 | ~18% |
| **RAZEM API** | **~1455** | 100% |

Page NFT: dodatkowe ~21 MB (pomijalne).

---

## 13. TOP 10 źródeł Functions Storage

1. **Powielenie całego `public/images`** przez `lib/email.ts` — ~524 MB  
2. **Powielenie `chromium.br` (+inne `.br`)** przez includes — ~326 MB  
3. **Powielenie `typescript`** przez łańcuch puppeteer/cosmiconfig — ~303 MB  
4. **Monolityczny `lib/invoicing.ts`** ciągnący PDF+email do preview/list/holds/discounts  
5. **`outputFileTracingIncludes` na `/corrective`** → preview z pełnym Chromium  
6. **5 pełnych „ciężkich” funkcji PDF** zamiast jednej współdzielonej usługi renderującej  
7. Pełny katalog images zamiast 5 CID PNG (~0,66 MB)  
8. Obecność pełnego `puppeteer` (local branch) w NFT serverless obok `puppeteer-core`  
9. Duży serwerowy chunk (~12 MB × 3) przy invoice matching  
10. Liczba API routes (126) — bazowy narzut ~1,3 MB × ~90 lekkich funkcji ≈ 120 MB (normalne)

---

## 14–15. NAJWIĘKSZY POTENCJAŁ REDUKCJI

*(tylko rekomendacje — **bez wdrożenia**)*

### 1) Zawęzić tracing `public/images` do 5 plików CID

- **Problem:** 19,39 MB × 27 funkcji.
- **Zmiana:** jawne ścieżki do 5 PNG / `outputFileTracingExcludes` na `public/images/**` + includes tylko potrzebnych; albo inline base64/CID bez fs.
- **Zysk:** ~**500 MB** (~34% z 1455) przy zachowaniu wyglądu maili.
- **Ryzyko:** **LOW** (jeśli lista plików kompletna).
- **Funkcje:** wszystkie 27 z email.

### 2) `outputFileTracingExcludes` dla `typescript/**`

- **Problem:** ~19 MB × 16 przez cosmiconfig.
- **Zmiana:** exclude `node_modules/typescript/**` (nieużywane w runtime PDF).
- **Zysk:** ~**300 MB** (~21%).
- **Ryzyko:** **LOW–MEDIUM** (zweryfikować brak runtime require typescript).
- **Funkcje:** 16 z Puppeteer.

### 3) Jedna wewnętrzna funkcja PDF + usunięcie includes z pozostałych

- **Problem:** 65 MB × 5.
- **Zmiana:** np. `/api/internal/render-pdf`; reszta woła HTTP/internal; includes tylko tam.
- **Zysk:** ~**260 MB** na binach (+ uproszczenie).
- **Ryzyko:** **MEDIUM–HIGH** (timeouty, auth, latencja, prod PDF umów/faktur).
- **Funkcje:** sign, cron, generate-*, corrective*.

### 4) Rozbić `lib/invoicing.ts` (PDF osobno od stałych/preview/holds)

- **Problem:** import stałych = cały Chromium stack.
- **Zmiana:** `invoice-constants.ts`, `invoice-preview.ts` bez `contract-pdf`.
- **Zysk:** ~**200–350 MB** (warstwa B schodzi z ~45 → ~2–21 MB).
- **Ryzyko:** **LOW–MEDIUM** (refaktor importów, bez zmiany UX jeśli API to samo).
- **Funkcje:** discounts, invoices list, holds, previews, held.

### 5) Usunąć zbędne includes / naprawić brakujące

- **Problem:** preview ma biny; lesson-billing/[id] i preview-pdf **nie mają** binów (ryzyko runtime).
- **Zmiana:** includes tylko tam, gdzie PDF naprawdę działa; poprawić klucz dynamiczny.
- **Zysk storage:** ~**110 MB** (preview); jednocześnie **naprawa** PDF tam gdzie brak `.br`.
- **Ryzyko:** **MEDIUM** (prod PDF).
- **Funkcje:** corrective/preview, preview-pdf, pickup-consent, yearly/lesson generate.

### 6) Serverless-only `puppeteer-core` (bez pełnego `puppeteer` w prod bundle)

- **Zysk:** mniejszy (kilka–kilkanaście MB × 16) + mniej transitive.
- **Ryzyko:** **LOW** lokalnie vs Vercel.

### Rozwiązania **bez zmiany zachowania** (najbezpieczniejsze najpierw)

1. Zawężenie images (LOW)
2. Exclude typescript (LOW–MEDIUM)
3. Split modułu invoicing / przeniesienie stałych (LOW–MEDIUM)
4. Korekta `outputFileTracingIncludes` (MEDIUM — test PDF na staging)

---

## 16. Potwierdzenie zakresu analizy

- Żadnych zmian w kodzie produkcyjnym, konfiguracji runtime ani zależnościach w trakcie pomiaru.
- Brak deployu, migracji, maili, generowania dokumentów użytkowników.
- Dane z istniejącego lokalnego `.next` (126 API NFT).

**Werdykt:** wysokie Functions Storage to nie tylko Chromium. W tym buildzie **największym pojedynczym źródłem jest powielenie `public/images` (~36%)**, potem **biny Chromium (~22%)**, potem **przypadkowy `typescript` przy Puppeteerze (~21%)**, napędzane wspólnymi importami `email` / `invoicing` / `contract-pdf` oraz `outputFileTracingIncludes`.
