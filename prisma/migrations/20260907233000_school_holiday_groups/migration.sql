-- Zakres dnia wolnego per grupa. Brak wierszy dla holiday_id = wszystkie grupy szkoły.

CREATE TABLE IF NOT EXISTS "school_holiday_groups" (
  "holiday_id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  CONSTRAINT "school_holiday_groups_pkey" PRIMARY KEY ("holiday_id", "group_id")
);

CREATE INDEX IF NOT EXISTS "idx_school_holiday_groups_group" ON "school_holiday_groups"("group_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_holiday_groups_holiday_id_fkey'
  ) THEN
    ALTER TABLE "school_holiday_groups"
      ADD CONSTRAINT "school_holiday_groups_holiday_id_fkey"
      FOREIGN KEY ("holiday_id") REFERENCES "school_holidays"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_holiday_groups_group_id_fkey'
  ) THEN
    ALTER TABLE "school_holiday_groups"
      ADD CONSTRAINT "school_holiday_groups_group_id_fkey"
      FOREIGN KEY ("group_id") REFERENCES "groups"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;
