-- KDR jest w parent_profiles; kolumna na enrollment_requests nie jest już używana.

ALTER TABLE enrollment_requests
  DROP COLUMN IF EXISTS discount_large_family;
