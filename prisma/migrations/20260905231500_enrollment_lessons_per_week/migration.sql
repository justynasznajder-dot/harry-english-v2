-- Wybór rodzica: częstotliwość zajęć (1× lub 2× w tygodniu).

ALTER TABLE "enrollment_requests" ADD COLUMN IF NOT EXISTS "lessons_per_week" INTEGER;

ALTER TABLE "enrollment_requests"
  DROP CONSTRAINT IF EXISTS "enrollment_requests_lessons_per_week_check";

ALTER TABLE "enrollment_requests"
  ADD CONSTRAINT "enrollment_requests_lessons_per_week_check"
  CHECK ("lessons_per_week" IS NULL OR "lessons_per_week" IN (1, 2));
