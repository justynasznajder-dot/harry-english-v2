-- Tryb bez opłat: rodzice z konta (users) lub ze zgłoszenia (enrollment_requests po e-mailu).

ALTER TABLE school_complimentary_parents
  ADD COLUMN IF NOT EXISTS id TEXT;

UPDATE school_complimentary_parents
SET id = gen_random_uuid()::text
WHERE id IS NULL;

ALTER TABLE school_complimentary_parents
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;

ALTER TABLE school_complimentary_parents
  DROP CONSTRAINT IF EXISTS school_complimentary_parents_pkey;

ALTER TABLE school_complimentary_parents
  ALTER COLUMN parent_id DROP NOT NULL;

ALTER TABLE school_complimentary_parents
  ADD COLUMN IF NOT EXISTS parent_email TEXT;

ALTER TABLE school_complimentary_parents
  ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_complimentary_parents_user
  ON school_complimentary_parents (school_id, parent_id)
  WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_complimentary_parents_email
  ON school_complimentary_parents (school_id, LOWER(BTRIM(parent_email)))
  WHERE parent_email IS NOT NULL AND BTRIM(parent_email) <> '';

ALTER TABLE school_complimentary_parents
  DROP CONSTRAINT IF EXISTS school_complimentary_parents_identity_check;

ALTER TABLE school_complimentary_parents
  ADD CONSTRAINT school_complimentary_parents_identity_check
  CHECK (
    parent_id IS NOT NULL
    OR (parent_email IS NOT NULL AND BTRIM(parent_email) <> '')
  );
