-- Karta Dużej Rodziny na poziomie rodzica (parent_profiles).

ALTER TABLE parent_profiles
  ADD COLUMN IF NOT EXISTS discount_large_family BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE parent_profiles pp
SET discount_large_family = TRUE
WHERE EXISTS (
  SELECT 1
  FROM enrollment_requests er
  WHERE er.discount_large_family = TRUE
    AND (
      er.user_id = pp.user_id
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = pp.user_id
          AND LOWER(BTRIM(u.email::text)) = LOWER(BTRIM(er.parent_email::text))
      )
    )
);
