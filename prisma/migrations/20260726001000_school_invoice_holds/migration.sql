-- Wstrzymanie generowania faktur ratalnych dla rodzica (ręczne + automatyczne).
CREATE TABLE IF NOT EXISTS "school_invoice_holds" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_invoice_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_school_invoice_holds_school_parent"
ON "school_invoice_holds"("school_id", "parent_id");

CREATE INDEX IF NOT EXISTS "idx_school_invoice_holds_parent"
ON "school_invoice_holds"("parent_id");

CREATE INDEX IF NOT EXISTS "idx_school_invoice_holds_school"
ON "school_invoice_holds"("school_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_invoice_holds_school_id_fkey'
  ) THEN
    ALTER TABLE "school_invoice_holds"
      ADD CONSTRAINT "school_invoice_holds_school_id_fkey"
      FOREIGN KEY ("school_id") REFERENCES "schools"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_invoice_holds_parent_id_fkey'
  ) THEN
    ALTER TABLE "school_invoice_holds"
      ADD CONSTRAINT "school_invoice_holds_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
