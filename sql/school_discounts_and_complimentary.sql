-- Ustawienia zniżek szkoły oraz lista rodziców w trybie bezpłatnym (znajomi).

CREATE TABLE IF NOT EXISTS school_discount_settings (
  school_id    TEXT NOT NULL REFERENCES schools(id),
  discount_key TEXT NOT NULL,
  percent      DECIMAL(5, 2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, discount_key),
  CONSTRAINT school_discount_settings_percent_range CHECK (percent >= 0 AND percent <= 100)
);

CREATE TABLE IF NOT EXISTS school_complimentary_parents (
  school_id  TEXT NOT NULL REFERENCES schools(id),
  parent_id  TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_school_complimentary_parents_parent
  ON school_complimentary_parents (parent_id);

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS discount_large_family BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discount_sibling BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS billing_exempt BOOLEAN NOT NULL DEFAULT FALSE;
