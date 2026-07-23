-- Dane sprzedawcy / ustawienia faktury na szkole
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_seller_name" VARCHAR(255);
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_seller_address" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_seller_nip" VARCHAR(20);
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_place" VARCHAR(100);
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_bank_account" VARCHAR(40);
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_bank_label" VARCHAR(100);
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_issuer_name" VARCHAR(255);
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_vat_exemption" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_default_item_name" VARCHAR(255);

-- Metadane faktury PDF na płatności (1 payment = 1 faktura)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_number" VARCHAR(40);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_issue_date" DATE;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_sale_date" DATE;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_pdf_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_school_invoice_number_key"
  ON "payments" ("school_id", "invoice_number");

-- Licznik numeracji FS n/MM/YYYY per szkoła i miesiąc
CREATE TABLE IF NOT EXISTS "invoice_counters" (
  "school_id" TEXT NOT NULL,
  "year_month" VARCHAR(7) NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("school_id", "year_month"),
  CONSTRAINT "invoice_counters_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- Seed danych sprzedawcy (Harry English / FHU Michał Sznajder — z próbek Subiekt)
UPDATE "schools"
SET
  "invoice_seller_name" = COALESCE("invoice_seller_name", 'FIRMA HANDLOWO USŁUGOWA MICHAŁ SZNAJDER'),
  "invoice_seller_address" = COALESCE("invoice_seller_address", 'Powstańców Śląskich 146, 44-177 Paniówki'),
  "invoice_seller_nip" = COALESCE("invoice_seller_nip", '6412394661'),
  "invoice_place" = COALESCE("invoice_place", 'Paniówki'),
  "invoice_bank_account" = COALESCE("invoice_bank_account", '91 1050 1298 1000 0092 5894 4835'),
  "invoice_bank_label" = COALESCE("invoice_bank_label", 'PLN - ING'),
  "invoice_issuer_name" = COALESCE("invoice_issuer_name", 'Michał Sznajder'),
  "invoice_vat_exemption" = COALESCE(
    "invoice_vat_exemption",
    'Zwolnienie ze względu na rodzaj prowadzonej działalności (art. 43 ust. 1 ustawy o VAT)'
  ),
  "invoice_default_item_name" = COALESCE("invoice_default_item_name", 'Kurs języka angielskiego')
WHERE "id" IN (
  'efcb641a-e5bd-4e59-aa39-c08fd1b318e9',
  'c93d5ac1-fa59-497f-b450-a4e50e1fb50d'
);
