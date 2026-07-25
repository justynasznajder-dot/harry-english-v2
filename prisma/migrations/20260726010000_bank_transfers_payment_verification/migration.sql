-- Wyciągi bankowe (Google Drive) + przelewy do weryfikacji płatności faktur.

CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "drive_file_id" VARCHAR(128) NOT NULL,
    "drive_file_name" VARCHAR(512) NOT NULL,
    "year_folder" VARCHAR(10) NOT NULL,
    "transfer_count" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_statement_imports_school_drive_file_key"
ON "bank_statement_imports"("school_id", "drive_file_id");

CREATE INDEX "idx_bank_statement_imports_school"
ON "bank_statement_imports"("school_id");

ALTER TABLE "bank_statement_imports"
  ADD CONSTRAINT "bank_statement_imports_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "bank_transfers" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "booking_date" DATE NOT NULL,
    "counterparty" VARCHAR(512) NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'PLN',
    "bank_transaction_id" VARCHAR(64),
    "matched_payment_id" TEXT,
    "matched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_bank_transfers_school"
ON "bank_transfers"("school_id");

CREATE INDEX "idx_bank_transfers_import"
ON "bank_transfers"("import_id");

CREATE INDEX "idx_bank_transfers_matched_payment"
ON "bank_transfers"("matched_payment_id");

CREATE INDEX "idx_bank_transfers_school_amount"
ON "bank_transfers"("school_id", "amount");

ALTER TABLE "bank_transfers"
  ADD CONSTRAINT "bank_transfers_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "bank_transfers"
  ADD CONSTRAINT "bank_transfers_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "bank_statement_imports"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "bank_transfers"
  ADD CONSTRAINT "bank_transfers_matched_payment_id_fkey"
  FOREIGN KEY ("matched_payment_id") REFERENCES "payments"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
