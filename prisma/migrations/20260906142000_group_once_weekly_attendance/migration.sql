-- Częstotliwość grupy (1×/2×), dzień dla dzieci 1×, frekwencja członkostwa.

ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "lessons_per_week" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "groups"
  DROP CONSTRAINT IF EXISTS "groups_lessons_per_week_check";

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_lessons_per_week_check"
  CHECK ("lessons_per_week" IN (1, 2));

ALTER TABLE "schedule_templates" ADD COLUMN IF NOT EXISTS "once_weekly_day" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "group_students" ADD COLUMN IF NOT EXISTS "lessons_per_week" INTEGER;

ALTER TABLE "group_students"
  DROP CONSTRAINT IF EXISTS "group_students_lessons_per_week_check";

ALTER TABLE "group_students"
  ADD CONSTRAINT "group_students_lessons_per_week_check"
  CHECK ("lessons_per_week" IS NULL OR "lessons_per_week" IN (1, 2));
