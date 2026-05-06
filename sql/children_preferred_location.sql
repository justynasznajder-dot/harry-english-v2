-- Preferowana lokalizacja dziecka (rejestracja rodzica). Uruchom raz w bazie produkcyjnej.
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS preferred_location_id TEXT NULL
  REFERENCES locations (id);

CREATE INDEX IF NOT EXISTS idx_children_preferred_location_id
  ON children (preferred_location_id)
  WHERE preferred_location_id IS NOT NULL;
