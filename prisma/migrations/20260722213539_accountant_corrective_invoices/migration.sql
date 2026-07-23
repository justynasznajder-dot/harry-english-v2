-- Faktury korygujące + seria numeracji (FS / FK)

-- 1) invoice_counters: seria w kluczu głównym
ALTER TABLE "invoice_counters" ADD COLUMN IF NOT EXISTS "series" VARCHAR(8) NOT NULL DEFAULT 'FS';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_counters_pkey'
      AND conrelid = 'invoice_counters'::regclass
  ) THEN
    ALTER TABLE "invoice_counters" DROP CONSTRAINT "invoice_counters_pkey";
  END IF;
END $$;

ALTER TABLE "invoice_counters"
  ADD CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("school_id", "year_month", "series");

-- 2) invoices: typ dokumentu i powiązanie z korektą
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "document_type" VARCHAR(20) NOT NULL DEFAULT 'SALE';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "corrects_invoice_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "correction_reason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_corrects_invoice_id_fkey'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_corrects_invoice_id_fkey"
      FOREIGN KEY ("corrects_invoice_id") REFERENCES "invoices"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_invoices_corrects_invoice_id"
  ON "invoices" ("corrects_invoice_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_document_type_check'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_document_type_check"
      CHECK (
        (
          "document_type" = 'SALE'
          AND "corrects_invoice_id" IS NULL
          AND "correction_reason" IS NULL
        )
        OR
        (
          "document_type" = 'CORRECTIVE'
          AND "corrects_invoice_id" IS NOT NULL
          AND "correction_reason" IS NOT NULL
          AND length(btrim("correction_reason")) > 0
        )
      );
  END IF;
END $$;
