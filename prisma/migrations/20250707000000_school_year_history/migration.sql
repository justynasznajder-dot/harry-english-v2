-- School year history: stats, close logs, payment FKs, membership uniqueness per year.

ALTER TABLE "school_years"
  ADD COLUMN "closed_at" TIMESTAMP(6),
  ADD COLUMN "closed_by" TEXT;

ALTER TABLE "payments"
  ADD COLUMN "school_year_id" TEXT;

ALTER TABLE "lesson_billing_periods"
  ADD COLUMN "school_year_id" TEXT;

ALTER TABLE "schedule_templates"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "group_students" gs
SET "school_year_id" = g."school_year_id"
FROM "groups" g
WHERE g."id" = gs."group_id"
  AND gs."school_year_id" IS NULL
  AND g."school_year_id" IS NOT NULL;

DROP INDEX IF EXISTS "group_students_group_id_child_id_key";

CREATE UNIQUE INDEX "group_students_group_id_child_id_school_year_id_key"
  ON "group_students"("group_id", "child_id", "school_year_id");

CREATE TABLE "school_year_teacher_stats" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "school_id" TEXT NOT NULL,
  "school_year_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "groups_count" INTEGER NOT NULL DEFAULT 0,
  "students_count" INTEGER NOT NULL DEFAULT 0,
  "lessons_scheduled" INTEGER NOT NULL DEFAULT 0,
  "lessons_completed" INTEGER NOT NULL DEFAULT 0,
  "lessons_cancelled" INTEGER NOT NULL DEFAULT 0,
  "total_duration_min" INTEGER NOT NULL DEFAULT 0,
  "attendance_marked_count" INTEGER NOT NULL DEFAULT 0,
  "computed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_year_teacher_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "school_year_teacher_stats_school_id_school_year_id_teacher_id_key"
  ON "school_year_teacher_stats"("school_id", "school_year_id", "teacher_id");

CREATE INDEX "idx_school_year_teacher_stats_year"
  ON "school_year_teacher_stats"("school_year_id");

CREATE TABLE "school_year_close_logs" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "school_id" TEXT NOT NULL,
  "school_year_id" TEXT NOT NULL,
  "closed_by" TEXT,
  "closed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lessons_cancelled" INTEGER NOT NULL DEFAULT 0,
  "lessons_completed" INTEGER NOT NULL DEFAULT 0,
  "groups_deactivated" INTEGER NOT NULL DEFAULT 0,
  "memberships_closed" INTEGER NOT NULL DEFAULT 0,
  "subscriptions_expired" INTEGER NOT NULL DEFAULT 0,
  "schedule_templates_deactivated" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  CONSTRAINT "school_year_close_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_school_year_close_logs_year"
  ON "school_year_close_logs"("school_year_id");

CREATE INDEX "idx_school_year_close_logs_school"
  ON "school_year_close_logs"("school_id");

ALTER TABLE "school_years"
  ADD CONSTRAINT "school_years_closed_by_fkey"
  FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_school_year_id_fkey"
  FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "lesson_billing_periods"
  ADD CONSTRAINT "lesson_billing_periods_school_year_id_fkey"
  FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "school_year_teacher_stats"
  ADD CONSTRAINT "school_year_teacher_stats_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "school_year_teacher_stats"
  ADD CONSTRAINT "school_year_teacher_stats_school_year_id_fkey"
  FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "school_year_teacher_stats"
  ADD CONSTRAINT "school_year_teacher_stats_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "school_year_close_logs"
  ADD CONSTRAINT "school_year_close_logs_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "school_year_close_logs"
  ADD CONSTRAINT "school_year_close_logs_school_year_id_fkey"
  FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "school_year_close_logs"
  ADD CONSTRAINT "school_year_close_logs_closed_by_fkey"
  FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
