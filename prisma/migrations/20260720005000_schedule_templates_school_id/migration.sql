-- school_id na schedule_templates (pierwsza kolumna fizycznie)

ALTER TABLE "lessons" DROP CONSTRAINT IF EXISTS "lessons_schedule_template_id_fkey";

CREATE TABLE "schedule_templates_new" (
    "school_id" TEXT NOT NULL,
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "group_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "school_year_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "schedule_templates_new_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "schedule_templates" st
    LEFT JOIN "groups" g ON g.id = st.group_id
    WHERE g.id IS NULL
  ) THEN
    RAISE EXCEPTION 'schedule_templates: sa wiersze bez grupy — nie mozna uzupelnic school_id';
  END IF;
END $$;

INSERT INTO "schedule_templates_new" (
    "school_id",
    "id",
    "group_id",
    "location_id",
    "day_of_week",
    "start_time",
    "duration_min",
    "school_year_id",
    "active"
)
SELECT
    g.school_id,
    st.id,
    st.group_id,
    st.location_id,
    st.day_of_week,
    st.start_time,
    st.duration_min,
    st.school_year_id,
    COALESCE(st.active, true)
FROM "schedule_templates" st
JOIN "groups" g ON g.id = st.group_id;

DROP TABLE "schedule_templates";

ALTER TABLE "schedule_templates_new" RENAME TO "schedule_templates";
ALTER INDEX "schedule_templates_new_pkey" RENAME TO "schedule_templates_pkey";

ALTER TABLE "schedule_templates"
  ADD CONSTRAINT "schedule_templates_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "schedule_templates"
  ADD CONSTRAINT "schedule_templates_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "schedule_templates"
  ADD CONSTRAINT "schedule_templates_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "schedule_templates"
  ADD CONSTRAINT "schedule_templates_school_year_id_fkey"
  FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_schedule_template_id_fkey"
  FOREIGN KEY ("schedule_template_id") REFERENCES "schedule_templates"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "idx_schedule_templates_group_id" ON "schedule_templates"("group_id");
CREATE INDEX "idx_schedule_templates_school_id" ON "schedule_templates"("school_id");
