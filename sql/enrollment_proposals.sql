-- Historia propozycji grup (HarryEnglish v2)
-- Uruchom ręcznie na PostgreSQL przed wdrożeniem kodu korzystającego z tabeli.

CREATE TABLE IF NOT EXISTS enrollment_proposals (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  enrollment_request_id TEXT NOT NULL REFERENCES enrollment_requests(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'PENDING',
  responded_at TIMESTAMPTZ,
  rejection_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrollment_proposals_status_chk CHECK (
    UPPER(BTRIM(status)) IN ('PENDING', 'ACCEPTED', 'REJECTED')
  )
);

CREATE INDEX IF NOT EXISTS idx_enrollment_proposals_request
  ON enrollment_proposals (enrollment_request_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_proposals_school
  ON enrollment_proposals (school_id);

CREATE UNIQUE INDEX IF NOT EXISTS enrollment_proposals_one_pending_per_request
  ON enrollment_proposals (enrollment_request_id)
  WHERE UPPER(BTRIM(status)) = 'PENDING';
