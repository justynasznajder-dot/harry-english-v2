-- Dzień generowania faktur ratalnych (1–28)
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "invoice_generation_day" INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_invoice_generation_day_check'
  ) THEN
    ALTER TABLE "schools"
      ADD CONSTRAINT "schools_invoice_generation_day_check"
      CHECK ("invoice_generation_day" >= 1 AND "invoice_generation_day" <= 28);
  END IF;
END $$;

-- Niemutowalny snapshot faktury
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "school_id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "parent_id" TEXT NOT NULL,
  "child_id" TEXT,
  "contract_id" TEXT,
  "school_year_id" TEXT,
  "invoice_number" VARCHAR(40) NOT NULL,
  "issue_date" DATE NOT NULL,
  "sale_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "seller_name" VARCHAR(255) NOT NULL,
  "seller_address" TEXT NOT NULL,
  "seller_nip" VARCHAR(20) NOT NULL,
  "issue_place" VARCHAR(100) NOT NULL,
  "bank_account" VARCHAR(40) NOT NULL,
  "bank_label" VARCHAR(100) NOT NULL,
  "issuer_name" VARCHAR(255) NOT NULL,
  "vat_exemption" TEXT NOT NULL,
  "buyer_name" VARCHAR(255) NOT NULL,
  "buyer_address" TEXT NOT NULL,
  "buyer_nip" VARCHAR(20),
  "item_name" VARCHAR(255) NOT NULL,
  "item_qty" VARCHAR(40) NOT NULL,
  "item_discount" VARCHAR(40) NOT NULL,
  "item_unit_price" DECIMAL NOT NULL,
  "item_value" DECIMAL NOT NULL,
  "amount" DECIMAL NOT NULL,
  "amount_in_words" TEXT NOT NULL,
  "payment_method" VARCHAR(40) NOT NULL DEFAULT 'Przelew',
  "currency" VARCHAR(10) NOT NULL DEFAULT 'PLN',
  "content_html" TEXT NOT NULL,
  "pdf_key" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_payment_id_key" UNIQUE ("payment_id"),
  CONSTRAINT "invoices_school_invoice_number_key" UNIQUE ("school_id", "invoice_number"),
  CONSTRAINT "invoices_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "invoices_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "invoices_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "invoices_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "invoices_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "invoices_school_year_id_fkey"
    FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_invoices_parent_id" ON "invoices" ("parent_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_school_issue" ON "invoices" ("school_id", "issue_date");

-- Przeniesienie istniejących metadanych z payments (best-effort; brak pełnego snapshotu HTML)
INSERT INTO "invoices" (
  "id", "school_id", "payment_id", "parent_id", "child_id", "contract_id", "school_year_id",
  "invoice_number", "issue_date", "sale_date", "due_date",
  "seller_name", "seller_address", "seller_nip", "issue_place",
  "bank_account", "bank_label", "issuer_name", "vat_exemption",
  "buyer_name", "buyer_address", "buyer_nip",
  "item_name", "item_qty", "item_discount", "item_unit_price", "item_value",
  "amount", "amount_in_words", "payment_method", "currency",
  "content_html", "pdf_key", "created_at"
)
SELECT
  (gen_random_uuid())::text,
  p.school_id,
  p.id,
  p.parent_id,
  p.child_id,
  p.contract_id,
  p.school_year_id,
  p.invoice_number,
  COALESCE(p.invoice_issue_date, CURRENT_DATE),
  COALESCE(p.invoice_sale_date, CURRENT_DATE),
  COALESCE(p.due_date, CURRENT_DATE),
  COALESCE(s.invoice_seller_name, '—'),
  COALESCE(s.invoice_seller_address, '—'),
  COALESCE(s.invoice_seller_nip, '—'),
  COALESCE(s.invoice_place, '—'),
  COALESCE(s.invoice_bank_account, '—'),
  COALESCE(s.invoice_bank_label, '—'),
  COALESCE(s.invoice_issuer_name, '—'),
  COALESCE(s.invoice_vat_exemption, '—'),
  COALESCE(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '—'),
  COALESCE(
    NULLIF(
      TRIM(CONCAT_WS(', ', NULLIF(TRIM(pp.address), ''), NULLIF(TRIM(CONCAT_WS(' ', pp.zip_code, pp.city)), ''))),
      ''
    ),
    '—'
  ),
  NULLIF(TRIM(pp.nip), ''),
  COALESCE(s.invoice_default_item_name, 'Kurs języka angielskiego'),
  '1 szt',
  '0 %',
  COALESCE(p.amount, 0),
  COALESCE(p.amount, 0),
  COALESCE(p.amount, 0),
  '—',
  'Przelew',
  'PLN',
  '<p>Migracja: brak zamrożonego HTML (faktura sprzed wprowadzenia snapshotu).</p>',
  p.invoice_pdf_key,
  COALESCE(p.created_at, NOW())
FROM "payments" p
JOIN "schools" s ON s.id = p.school_id
JOIN "users" u ON u.id = p.parent_id
LEFT JOIN "parent_profiles" pp ON pp.user_id = p.parent_id
WHERE p.invoice_number IS NOT NULL
  AND p.school_id IS NOT NULL
  AND p.parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "invoices" i WHERE i.payment_id = p.id);

DROP INDEX IF EXISTS "payments_school_invoice_number_key";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "invoice_number";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "invoice_issue_date";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "invoice_sale_date";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "invoice_pdf_key";
