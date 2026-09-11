-- Flaga widocznosci komunikatu o zmianie harmonogramu u rodzicow (bez maila).
-- schedule_before_label = snapshot terminu z umowy; nie czyscimy przy odznaczeniu.

ALTER TABLE "groups"
  ADD COLUMN IF NOT EXISTS "schedule_change_notice" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "groups"
  ADD COLUMN IF NOT EXISTS "schedule_before_label" TEXT;
