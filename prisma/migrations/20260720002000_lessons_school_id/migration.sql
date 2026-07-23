-- school_id na lessons (tenant + prostsze filtry bez JOIN do groups)

ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "school_id" TEXT;

UPDATE "lessons" l
SET school_id = g.school_id
FROM "groups" g
WHERE g.id = l.group_id
  AND l.school_id IS NULL;

UPDATE "lessons" l
SET school_id = sy.school_id
FROM "school_years" sy
WHERE sy.id = l.school_year_id
  AND l.school_id IS NULL
  AND l.school_year_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "lessons" WHERE school_id IS NULL
  ) THEN
    RAISE EXCEPTION 'lessons.school_id: pozostaly wiersze bez school_id — uzupelnij przed NOT NULL';
  END IF;
END $$;

ALTER TABLE "lessons" ALTER COLUMN "school_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_school_id_fkey'
  ) THEN
    ALTER TABLE "lessons"
      ADD CONSTRAINT "lessons_school_id_fkey"
      FOREIGN KEY ("school_id") REFERENCES "schools"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_lessons_school_id"
  ON "lessons"("school_id");
