-- Usunięcie nadpisywania stawek — ceny wyłącznie z cennika grupy + sekcja Zniżki.

ALTER TABLE contracts
  DROP COLUMN IF EXISTS override_amount_monthly,
  DROP COLUMN IF EXISTS override_amount_yearly,
  DROP COLUMN IF EXISTS price_override;

ALTER TABLE enrollment_requests
  ADD COLUMN IF NOT EXISTS discount_large_family BOOLEAN NOT NULL DEFAULT FALSE;
