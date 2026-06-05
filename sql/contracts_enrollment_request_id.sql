-- Powiązanie umowy ze zgłoszeniem rekrutacyjnym (enrollment flow).
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS enrollment_request_id TEXT;

CREATE INDEX IF NOT EXISTS contracts_enrollment_request_id_idx
  ON contracts (enrollment_request_id);

-- Uzupełnij istniejące rekordy na podstawie children.enrollment_request_id.
UPDATE contracts c
SET enrollment_request_id = ch.enrollment_request_id
FROM children ch
WHERE c.enrollment_request_id IS NULL
  AND c.child_id = ch.id
  AND ch.enrollment_request_id IS NOT NULL;
