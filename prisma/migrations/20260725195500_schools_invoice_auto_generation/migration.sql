-- Tryb automatycznego generowania faktur ratalnych (cron).
-- false = tylko ręczne z panelu; true = cron w invoice_generation_day.
ALTER TABLE "schools"
  ADD COLUMN IF NOT EXISTS "invoice_auto_generation" BOOLEAN NOT NULL DEFAULT false;
