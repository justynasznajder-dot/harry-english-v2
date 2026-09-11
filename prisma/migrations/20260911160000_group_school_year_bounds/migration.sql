-- Opcjonalne zawężenie zakresu generowania zajęć względem dat roku szkolnego (per grupa × rok).

CREATE TABLE IF NOT EXISTS "group_school_year_bounds" (
    "group_id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "lessons_start_on" DATE,
    "lessons_end_on" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_school_year_bounds_pkey" PRIMARY KEY ("group_id", "school_year_id")
);

CREATE INDEX IF NOT EXISTS "idx_group_school_year_bounds_year"
  ON "group_school_year_bounds"("school_year_id");

CREATE INDEX IF NOT EXISTS "idx_group_school_year_bounds_school"
  ON "group_school_year_bounds"("school_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_school_year_bounds_group_id_fkey'
  ) THEN
    ALTER TABLE "group_school_year_bounds"
      ADD CONSTRAINT "group_school_year_bounds_group_id_fkey"
      FOREIGN KEY ("group_id") REFERENCES "groups"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_school_year_bounds_school_year_id_fkey'
  ) THEN
    ALTER TABLE "group_school_year_bounds"
      ADD CONSTRAINT "group_school_year_bounds_school_year_id_fkey"
      FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_school_year_bounds_school_id_fkey'
  ) THEN
    ALTER TABLE "group_school_year_bounds"
      ADD CONSTRAINT "group_school_year_bounds_school_id_fkey"
      FOREIGN KEY ("school_id") REFERENCES "schools"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;
