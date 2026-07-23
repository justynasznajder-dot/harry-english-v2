-- Fizyczna kolejność kolumn: school_id jako pierwsza w lessons

ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_lesson_id_fkey";
ALTER TABLE "progress_notes" DROP CONSTRAINT IF EXISTS "progress_notes_lesson_id_fkey";

CREATE TABLE "lessons_new" (
    "school_id" TEXT NOT NULL,
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "group_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(6) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancellation_reason" TEXT,
    "school_year_id" TEXT,
    "schedule_template_id" TEXT,
    CONSTRAINT "lessons_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "lessons_new" (
    "school_id",
    "id",
    "group_id",
    "teacher_id",
    "location_id",
    "scheduled_at",
    "duration_min",
    "status",
    "notes",
    "created_at",
    "cancellation_reason",
    "school_year_id",
    "schedule_template_id"
)
SELECT
    "school_id",
    "id",
    "group_id",
    "teacher_id",
    "location_id",
    "scheduled_at",
    "duration_min",
    "status",
    "notes",
    "created_at",
    "cancellation_reason",
    "school_year_id",
    "schedule_template_id"
FROM "lessons";

DROP TABLE "lessons";

ALTER TABLE "lessons_new" RENAME TO "lessons";
ALTER INDEX "lessons_new_pkey" RENAME TO "lessons_pkey";

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_schedule_template_id_fkey"
  FOREIGN KEY ("schedule_template_id") REFERENCES "schedule_templates"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_school_year_id_fkey"
  FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "progress_notes"
  ADD CONSTRAINT "progress_notes_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_lessons_group_id" ON "lessons"("group_id");
CREATE INDEX "idx_lessons_schedule_template_id" ON "lessons"("schedule_template_id");
CREATE INDEX "idx_lessons_scheduled_at" ON "lessons"("scheduled_at");
CREATE INDEX "idx_lessons_school_year_id" ON "lessons"("school_year_id");
CREATE INDEX "idx_lessons_school_id" ON "lessons"("school_id");
