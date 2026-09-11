-- Komunikat „zmiana grupy” dla rodzica (per członkostwo / rok).

ALTER TABLE "group_students"
  ADD COLUMN IF NOT EXISTS "group_change_notice" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "group_students"
  ADD COLUMN IF NOT EXISTS "group_before_label" TEXT;
