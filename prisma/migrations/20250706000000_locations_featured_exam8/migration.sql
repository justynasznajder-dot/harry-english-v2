-- Kolejność i wyróżnienie lokalizacji + egzamin 8-klasisty dla dwóch szkół.

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_featured" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "locations" (id, school_id, name, address, active, sort_order, is_featured)
SELECT (gen_random_uuid())::text, s.school_id, 'Przygotowanie do egzaminu 8-klasisty', NULL, TRUE, 0, TRUE
FROM (VALUES
  ('c93d5ac1-fa59-497f-b450-a4e50e1fb50d'::text),
  ('efcb641a-e5bd-4e59-aa39-c08fd1b318e9'::text)
) AS s(school_id)
WHERE EXISTS (SELECT 1 FROM "schools" sch WHERE sch.id = s.school_id)
  AND NOT EXISTS (
    SELECT 1 FROM "locations" l
    WHERE l.school_id = s.school_id
      AND l.name = 'Przygotowanie do egzaminu 8-klasisty'
  );

UPDATE "locations"
SET sort_order = 0,
    is_featured = TRUE,
    active = TRUE,
    name = 'Przygotowanie do egzaminu 8-klasisty'
WHERE school_id IN (
  'c93d5ac1-fa59-497f-b450-a4e50e1fb50d',
  'efcb641a-e5bd-4e59-aa39-c08fd1b318e9'
)
AND name = 'Przygotowanie do egzaminu 8-klasisty';
