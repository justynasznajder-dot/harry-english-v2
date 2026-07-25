-- Hold per umowa (dziecko) + miesiąc rozliczeniowy (nie przenosi się na kolejny miesiąc).
DROP TABLE IF EXISTS "school_invoice_holds";

CREATE TABLE "school_invoice_holds" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "period_month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_invoice_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_school_invoice_holds_school_contract_period"
ON "school_invoice_holds"("school_id", "contract_id", "period_month");

CREATE INDEX "idx_school_invoice_holds_contract"
ON "school_invoice_holds"("contract_id");

CREATE INDEX "idx_school_invoice_holds_school_period"
ON "school_invoice_holds"("school_id", "period_month");

ALTER TABLE "school_invoice_holds"
  ADD CONSTRAINT "school_invoice_holds_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "school_invoice_holds"
  ADD CONSTRAINT "school_invoice_holds_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
