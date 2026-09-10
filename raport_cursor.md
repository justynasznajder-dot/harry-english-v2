# Raport: Chromium / Puppeteer a Vercel Functions Storage

Data analizy: 2026-09-10  
Projekt: HarryEnglish v2  
Zakres: wyłącznie odczyt — bez zmian w kodzie, zależnościach ani konfiguracji.

---

## A. Chromium/Puppeteer wykryte: **TAK**

Projekt aktywnie używa headless Chromium do generowania PDF z HTML (umowy, załączniki, faktury).

---

## B. Zainstalowane pakiety i wersje

Źródła: `package.json` + `package-lock.json`.

Wszystkie poniższe są w **dependencies** (nie w devDependencies):

| Pakiet | Wersja w package.json | Rozwiązana w lockfile | Typ |
|---|---|---|---|
| `@sparticuz/chromium` | `^147.0.0` | **147.0.0** | dependencies |
| `puppeteer` | `^24.43.1` | **24.43.1** | dependencies |
| `puppeteer-core` | `^24.43.1` | **24.43.1** | dependencies |

Powiązane (transitive, nie bezpośrednie zależności aplikacji):

- `@puppeteer/browsers` **2.13.2**
- `chromium-bidi` **14.0.0**

**Nie zainstalowane** (brak w dependencies/devDependencies):

- `chrome-aws-lambda`
- `playwright` / `playwright-core` (jest tylko opcjonalny peerDependency `next` → `@playwright/test`, nie zainstalowany)
- inne silniki headless (PhantomJS, Selenium itd.)

Rozmiary lokalne w `node_modules`:

- `@sparticuz/chromium` ≈ **65,3 MB** (w tym `bin/chromium.br` ≈ **60,7 MB**)
- `puppeteer-core` ≈ **8,5 MB**
- `puppeteer` ≈ **0,06 MB** (wrapper; browser download jest osobno)

Szczegóły binariów `@sparticuz/chromium/bin`:

| Plik | Rozmiar |
|---|---|
| `chromium.br` | ≈ 60,66 MB |
| `swiftshader.tar.br` | ≈ 3,33 MB |
| `al2023.tar.br` | ≈ 1,03 MB |
| `fonts.tar.br` | ≈ 0,18 MB |
| **Razem bin/** | ≈ **65,19 MB** |

---

## C. Pliki, które ich używają

### Jedyny punkt uruchomienia przeglądarki

`lib/contract-pdf.ts` — dynamiczne importy:

```ts
async function launchPdfBrowser(): Promise<PdfBrowser> {
  if (isServerlessRuntime()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;
    // ...
    executablePath: await chromium.executablePath(),
  }
  const puppeteer = (await import("puppeteer")).default;
  return (await puppeteer.launch({ headless: true, ... }))
}
```

**Cel:** render HTML → PDF (`page.pdf`, format A4).

- Na Vercel / `AWS_LAMBDA`: `@sparticuz/chromium` + `puppeteer-core`
- Lokalnie: pełny `puppeteer`

Eksporty runtime: `renderHtmlToPdf`, `buildSignedContractPdfFiles` (+ helpery nazw plików).

### Importy bezpośrednie (runtime PDF)

| Plik | Użycie |
|---|---|
| `app/api/enrollment/sign/route.ts` | `buildSignedContractPdfFiles` — PDF umowy + załączników przy podpisie |
| `app/api/parent/contract/preview-pdf/route.ts` | `renderHtmlToPdf` — podgląd PDF dla rodzica |
| `lib/invoicing.ts` | `renderHtmlToPdf` — PDF faktur (ok. linii 716 i 2350) |
| `lib/complimentary-pickup-consent.ts` | `renderHtmlToPdf` — PDF zgody na odbiór |
| `scripts/backfill-signed-contracts-r2.ts` | lokalny skrypt (nie funkcja Vercel) |
| `scripts/export-active-contract-templates-pdf.ts` | lokalny skrypt (dynamic `import("../lib/contract-pdf")`) |

### Importy pośrednie (przez `invoicing` / `complimentary-pickup-consent`)

Każdy route importujący `@/lib/invoicing` ciągnie **statyczny** `import { renderHtmlToPdf } from "@/lib/contract-pdf"`, więc NFT widzi Puppeteer/Chromium nawet gdy dana funkcja PDF nigdy nie generuje.

API routes z pośrednim łańcuchem:

- `app/api/cron/monthly-invoices/route.ts`
- `app/api/admin/invoices/generate-monthly/route.ts`
- `app/api/admin/invoices/generate-yearly/route.ts`
- `app/api/admin/invoices/route.ts` *(tylko stałe stringowe — i tak cały moduł)*
- `app/api/admin/invoices/holds/route.ts`
- `app/api/admin/invoices/monthly-preview/route.ts`
- `app/api/admin/invoices/yearly-preview/route.ts`
- `app/api/admin/lesson-billing/[id]/invoice/route.ts`
- `app/api/admin/lesson-billing/generate-invoices/route.ts`
- `app/api/accountant/invoices/corrective/route.ts`
- `app/api/accountant/invoices/corrective/preview/route.ts` *(preview HTML, bez PDF — ale ten sam moduł)*
- `app/api/accountant/invoices/held/route.ts`
- `app/api/admin/discounts/route.ts` *(ustawienia faktur, bez PDF)*
- `app/api/parent/pickup-consent/generate/route.ts` → `complimentary-pickup-consent` → PDF

### Tylko typy (bez runtime Chromium w tych plikach)

- `lib/r2-storage.ts` — `import type { ContractPdfFile }`
- `lib/drive-documents-storage.ts` — `import type { ContractPdfFile }`

### Server Actions

Brak `"use server"` w projekcie — PDF tylko przez API routes / lib / skrypty.

### Dynamiczne importy

Znalezione dokładnie w `lib/contract-pdf.ts`:

- `await import("@sparticuz/chromium")`
- `await import("puppeteer-core")`
- `await import("puppeteer")`

Plus w skrypcie: `await import("../lib/contract-pdf")`.

---

## D. Vercel Functions potencjalnie zawierające Chromium

### Konfiguracja bundlowania (`next.config.ts`)

- `serverExternalPackages`: `@sparticuz/chromium`, `puppeteer`, `puppeteer-core`, `@puppeteer/browsers`, …
- `outputFileTracingIncludes` **wymusza** `./node_modules/@sparticuz/chromium/**` dla:
  - `/api/enrollment/sign`
  - `/api/cron/monthly-invoices`
  - `/api/admin/invoices/generate-monthly`
  - `/api/admin/lesson-billing/[id]/invoice`
  - `/api/accountant/invoices/corrective`

`vercel.json` — tylko crons; bez ustawień bundla.

### Wynik lokalnego builda (`.next/**/*.nft.json`)

**16 funkcji** ma w NFT ścieżki `puppeteer` / `@sparticuz`.

#### Grupa 1 — pełny bin Chromium (~65 MB binów, cała funkcja ≈ **110 MB** traced)

Import: bezpośredni lub pośredni + `outputFileTracingIncludes` (biny `.br`):

| Funkcja | Import | Dlaczego Chromium w bundle |
|---|---|---|
| `/api/enrollment/sign` | bezpośredni `contract-pdf` | PDF przy podpisie + includes |
| `/api/cron/monthly-invoices` | pośredni `invoicing` | generowanie faktur PDF + includes |
| `/api/admin/invoices/generate-monthly` | pośredni `invoicing` | j.w. + includes |
| `/api/accountant/invoices/corrective` | pośredni `invoicing` | PDF korekty + includes |
| `/api/accountant/invoices/corrective/preview` | pośredni `invoicing` | **nie generuje PDF**, ale ma pełne biny (prawdopodobnie dziedziczenie / dopasowanie ścieżki includes od `.../corrective`) |

W NFT tych funkcji są m.in.: `chromium.br`, `al2023.tar.br`, `fonts.tar.br`, `swiftshader.tar.br` oraz `puppeteer`, `puppeteer-core`, `@puppeteer/browsers`.

#### Grupa 2 — JS Puppeteer/Chromium **bez** binów (~1 MB chromium-related; funkcja ≈ **24–45 MB** przez inne deps)

| Funkcja | Import | Uwaga |
|---|---|---|
| `/api/parent/contract/preview-pdf` | bezpośredni | **potrzebuje** binów w runtime, ale ich brak w NFT |
| `/api/parent/pickup-consent/generate` | pośredni | j.w. |
| `/api/admin/lesson-billing/[id]/invoice` | pośredni | jest w `outputFileTracingIncludes`, ale **biny nie trafiły** (prawdopodobnie problem z kluczem dynamicznej ścieżki) |
| `/api/admin/lesson-billing/generate-invoices` | pośredni | generuje PDF, brak includes |
| `/api/admin/invoices/generate-yearly` | pośredni | generuje PDF, brak includes |
| `/api/admin/invoices` | pośredni (tylko stałe) | zbędny pull |
| `/api/admin/invoices/holds` | pośredni | zbędny pull |
| `/api/admin/invoices/monthly-preview` | pośredni | preview bez PDF |
| `/api/admin/invoices/yearly-preview` | pośredni | preview bez PDF |
| `/api/accountant/invoices/held` | pośredni | zbędny pull |
| `/api/admin/discounts` | pośredni | zbędny pull |

**Import jest zawsze pośredni przez moduł** `contract-pdf` (poza `sign` i `preview-pdf`). Same `puppeteer*` są **dynamiczne**, ale Next NFT i tak je śledzi; oba branchy (`puppeteer` + `puppeteer-core` + `@sparticuz`) lądują w trace.

### Top funkcji po szacowanym rozmiarze traced (lokalny `.next`)

| MB (traced) | Chromium w NFT | Route |
|---:|:---:|---|
| 110,37 | TAK (z binami) | `enrollment/sign` |
| 110,34 | TAK (z binami) | `accountant/invoices/corrective/preview` |
| 110,34 | TAK (z binami) | `accountant/invoices/corrective` |
| 110,34 | TAK (z binami) | `admin/invoices/generate-monthly` |
| 110,31 | TAK (z binami) | `cron/monthly-invoices` |
| ~45 | TAK (bez binów) | m.in. `admin/discounts`, `admin/invoices/*`, `lesson-billing/*` |
| ~24–26 | TAK (bez binów) | `parent/pickup-consent/generate`, `parent/contract/preview-pdf` |

---

## E. Czy Chromium jest istotnym źródłem Functions Storage: **wysokie prawdopodobieństwo**

Uzasadnienie:

1. Sam `chromium.br` ≈ **61 MB**; pełny `@sparticuz/chromium/bin` ≈ **65 MB**.
2. Lokalny build pokazuje **~5 osobnych funkcji** z pełnym binarem i traced size ≈ **110 MB każda**.
3. Na Vercel każda Serverless Function liczy się osobno → te same ~65 MB Chromium są **powielane**.
4. Nawet bez binów, **11+ innych funkcji** i tak ciągnie `puppeteer-core` / fragmenty `@sparticuz` przez monolityczny `lib/invoicing.ts`.
5. Konfiguracja projektu **świadomie** dokłada Chromium do bundle (`outputFileTracingIncludes` + komentarz w `next.config.ts`).

Szacunek naiwny (suma NFT z Chromium, z double-count): **~1000 MB** traced łącznie po funkcjach; z tego sam ciężki bin w ~5 kopiach ≈ **325 MB** samego Chromium.

---

## F. Czy ta sama biblioteka jest powielana w wielu funkcjach: **TAK**

- `@sparticuz/chromium` (z binami): powtórzona w **co najmniej 5** funkcjach.
- `puppeteer` + `puppeteer-core` + `@puppeteer/browsers`: powtórzone w **16** funkcjach API.
- Źródło powielenia: osobne serverless bundles per route + wspólny ciężki moduł `contract-pdf` / `invoicing`, bez wydzielenia PDF do jednej funkcji.

---

## G. Rekomendacje optymalizacji (bez wdrażania)

1. **Jedna funkcja PDF** (np. wewnętrzne `/api/internal/render-pdf`) i wywołania z pozostałych route’ów — jeden bundle z Chromium zamiast wielu.
2. **Rozbić `lib/invoicing.ts`** — osobny moduł „PDF faktury”; route’y od stałych/preview/holds/discounts nie powinny importować `contract-pdf`.
3. **Doprecyzować `outputFileTracingIncludes`**: dodać wszystkie route’y realnie generujące PDF (`preview-pdf`, `pickup-consent/generate`, `generate-yearly`, `generate-invoices`); naprawić klucz dla `lesson-billing/[id]/invoice` (biny dziś nie wchodzą mimo wpisu).
4. **Usunąć zbędne includes** z route’ów bez PDF (np. `corrective/preview`, jeśli dziedziczy biny).
5. Na Vercel trzymać tylko `puppeteer-core` + `@sparticuz/chromium`; pełny `puppeteer` ograniczyć do local/dev (obecnie oba branchy są w NFT).
6. Alternatywa długoterminowa: zewnętrzny renderer PDF (serwis / queue / `@react-pdf` / HTML→PDF bez Chromium), żeby w ogóle nie wrzucać przeglądarki do Functions Storage.
7. Po zmianach: porównać sumę rozmiarów funkcji w Vercel dashboard / lokalne `*.nft.json`.

---

## Potwierdzenie zakresu analizy

W sesji analizy:

- nie usuwano plików,
- nie zmieniano kodu,
- nie aktualizowano zależności,
- nie edytowano `package.json` / lockfile,
- nie uruchamiano migracji ani deployu.

Ten plik (`raport_cursor.md`) jest jedynym artefaktem zapisanym na życzenie użytkownika po analizie.
