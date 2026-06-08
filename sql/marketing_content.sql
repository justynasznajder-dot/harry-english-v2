-- Treści marketingowe strony głównej (szkoła z SCHOOL_ID / registration school).
-- Wszystkie ID: TEXT + (gen_random_uuid())::text

CREATE TABLE IF NOT EXISTS marketing_gallery (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketing_gallery_school_id_idx ON marketing_gallery (school_id);

CREATE TABLE IF NOT EXISTS marketing_faq (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketing_faq_school_id_idx ON marketing_faq (school_id);

CREATE TABLE IF NOT EXISTS marketing_testimonial (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_label TEXT,
  rating SMALLINT DEFAULT 5,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketing_testimonial_school_id_idx ON marketing_testimonial (school_id);
