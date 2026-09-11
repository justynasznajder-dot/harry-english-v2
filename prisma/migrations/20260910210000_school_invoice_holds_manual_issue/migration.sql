-- Admin flagged held monthly invoice for manual accountant issuance.
ALTER TABLE "school_invoice_holds"
  ADD COLUMN IF NOT EXISTS "manual_issue" BOOLEAN NOT NULL DEFAULT false;
