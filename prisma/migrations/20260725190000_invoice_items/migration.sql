-- Pozycje faktury (wiele wierszy na fakturę zbiorczą / pojedynczą).

CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "invoice_id" TEXT NOT NULL,
  "lp" INTEGER NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "qty" VARCHAR(40) NOT NULL DEFAULT '1 szt',
  "discount" VARCHAR(40) NOT NULL DEFAULT '0 %',
  "unit_price" DECIMAL NOT NULL,
  "value" DECIMAL NOT NULL,
  "child_id" TEXT,
  "contract_id" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_items_invoice_lp_key"
  ON "invoice_items" ("invoice_id", "lp");

CREATE INDEX IF NOT EXISTS "idx_invoice_items_invoice_id"
  ON "invoice_items" ("invoice_id");

CREATE INDEX IF NOT EXISTS "idx_invoice_items_contract_id"
  ON "invoice_items" ("contract_id");

CREATE INDEX IF NOT EXISTS "idx_invoice_items_child_id"
  ON "invoice_items" ("child_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_fkey'
  ) THEN
    ALTER TABLE "invoice_items"
      ADD CONSTRAINT "invoice_items_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_child_id_fkey'
  ) THEN
    ALTER TABLE "invoice_items"
      ADD CONSTRAINT "invoice_items_child_id_fkey"
      FOREIGN KEY ("child_id") REFERENCES "children"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_contract_id_fkey'
  ) THEN
    ALTER TABLE "invoice_items"
      ADD CONSTRAINT "invoice_items_contract_id_fkey"
      FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

-- Backfill: jedna pozycja z flat item_* na istniejących fakturach.
INSERT INTO "invoice_items" (
  "invoice_id", "lp", "name", "qty", "discount", "unit_price", "value",
  "child_id", "contract_id", "created_at"
)
SELECT
  i."id",
  1,
  i."item_name",
  i."item_qty",
  i."item_discount",
  i."item_unit_price",
  i."item_value",
  i."child_id",
  i."contract_id",
  COALESCE(i."created_at", NOW())
FROM "invoices" i
WHERE NOT EXISTS (
  SELECT 1 FROM "invoice_items" ii WHERE ii."invoice_id" = i."id"
);
