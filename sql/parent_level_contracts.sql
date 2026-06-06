-- Umowa na poziomie rodzica (wiele dzieci w jednej umowie).

CREATE TABLE IF NOT EXISTS contract_children (
  contract_id           TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  child_id              TEXT NOT NULL REFERENCES children(id),
  enrollment_request_id TEXT REFERENCES enrollment_requests(id),
  group_id              TEXT REFERENCES groups(id),
  sort_order            INT NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_children_child
  ON contract_children (child_id);

ALTER TABLE contracts
  ALTER COLUMN child_id DROP NOT NULL,
  ALTER COLUMN group_id DROP NOT NULL;
