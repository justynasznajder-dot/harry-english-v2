-- Ujednolicenie kolumn ID / FK z UUID na TEXT (spójnie z resztą schematu).
-- Uruchom na istniejącej bazie po backupie / na pustej bazie testowej.
-- Bezpieczne wielokrotne uruchomienie: pomija kolumny już typu text.

-- school_years + school_holidays (tworzone przez school_years_setup.sql jako UUID)
CREATE TABLE IF NOT EXISTS school_years (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  school_id TEXT NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_holidays (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  school_id TEXT NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'HOLIDAY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT school_holidays_type_chk CHECK (type IN ('HOLIDAY', 'PUBLIC', 'SCHOOL', 'CANCELLED'))
);

DO $$
DECLARE
  r RECORD;
BEGIN
  -- FK wskazujące na school_years(id) — zdejmij przed zmianą typu PK
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, c.conname
    FROM pg_constraint c
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE c.contype = 'f'
      AND ref.relname = 'school_years'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%(id)%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- school_years
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_years' AND column_name = 'id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE school_years ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE school_years ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE school_years ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_years' AND column_name = 'school_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE school_years ALTER COLUMN school_id TYPE TEXT USING school_id::text;
  END IF;
END $$;

-- school_holidays
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_holidays' AND column_name = 'id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE school_holidays ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE school_holidays ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE school_holidays ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_holidays' AND column_name = 'school_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE school_holidays ALTER COLUMN school_id TYPE TEXT USING school_id::text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'school_holidays' AND column_name = 'school_year_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE school_holidays ALTER COLUMN school_year_id TYPE TEXT USING school_year_id::text;
  END IF;
END $$;

-- school_year_id na powiązanych tabelach
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'groups', 'lessons', 'subscriptions', 'schedule_templates', 'group_students', 'contracts'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'school_year_id'
        AND udt_name = 'uuid'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN school_year_id TYPE TEXT USING school_year_id::text',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Odtwórz FK do school_years(id) tam gdzie kolumna istnieje
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'school_holidays' AND column_name = 'school_year_id') THEN
    ALTER TABLE school_holidays DROP CONSTRAINT IF EXISTS school_holidays_school_year_id_fkey;
    ALTER TABLE school_holidays
      ADD CONSTRAINT school_holidays_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'groups' AND column_name = 'school_year_id') THEN
    ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_school_year_id_fkey;
    ALTER TABLE groups
      ADD CONSTRAINT groups_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'school_year_id') THEN
    ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_school_year_id_fkey;
    ALTER TABLE lessons
      ADD CONSTRAINT lessons_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'school_year_id') THEN
    ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_school_year_id_fkey;
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schedule_templates' AND column_name = 'school_year_id') THEN
    ALTER TABLE schedule_templates DROP CONSTRAINT IF EXISTS schedule_templates_school_year_id_fkey;
    ALTER TABLE schedule_templates
      ADD CONSTRAINT schedule_templates_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'group_students' AND column_name = 'school_year_id') THEN
    ALTER TABLE group_students DROP CONSTRAINT IF EXISTS group_students_school_year_id_fkey;
    ALTER TABLE group_students
      ADD CONSTRAINT group_students_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'school_year_id') THEN
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_school_year_id_fkey;
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_school_year_id_fkey
      FOREIGN KEY (school_year_id) REFERENCES school_years (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indeksy school_years (idempotent)
CREATE INDEX IF NOT EXISTS idx_school_years_school_id ON school_years (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_years_one_active ON school_years (school_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_school_holidays_school ON school_holidays (school_id);
CREATE INDEX IF NOT EXISTS idx_school_holidays_school_year ON school_holidays (school_year_id);
CREATE INDEX IF NOT EXISTS idx_groups_school_year_id ON groups (school_year_id);
CREATE INDEX IF NOT EXISTS idx_lessons_school_year_id ON lessons (school_year_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school_year_id ON subscriptions (school_year_id);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL;
