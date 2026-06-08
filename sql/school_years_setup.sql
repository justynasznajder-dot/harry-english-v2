-- Uruchom w Neon SQL Editor (lub migracja) przed użyciem API roku szkolnego.
-- Wszystkie ID: TEXT + (gen_random_uuid())::text

CREATE TABLE IF NOT EXISTS school_years (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  school_id TEXT NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_years_school_id ON school_years (school_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_years_one_active ON school_years (school_id) WHERE active = TRUE;

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

CREATE INDEX IF NOT EXISTS idx_school_holidays_school ON school_holidays (school_id);
CREATE INDEX IF NOT EXISTS idx_school_holidays_school_year ON school_holidays (school_year_id);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS school_year_id TEXT REFERENCES school_years (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_groups_school_year_id ON groups (school_year_id);
CREATE INDEX IF NOT EXISTS idx_lessons_school_year_id ON lessons (school_year_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school_year_id ON subscriptions (school_year_id);
