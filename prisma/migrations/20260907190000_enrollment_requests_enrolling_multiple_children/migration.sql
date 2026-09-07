-- Deklaracja rodzica: zapisuje więcej niż jedno dziecko (zniżka rodzeństwa).

ALTER TABLE "enrollment_requests"
  ADD COLUMN IF NOT EXISTS "enrolling_multiple_children" BOOLEAN NOT NULL DEFAULT false;
