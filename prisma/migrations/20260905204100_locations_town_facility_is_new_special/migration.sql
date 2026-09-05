-- Lokalizacje: miejscowość + placówka + Nowość! + pozycje specjalne
-- Kolumna `name` zostaje jako złożona etykieta (bez „(Nowość!)”) dla kompatybilności.

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "town" VARCHAR(255);
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "facility" VARCHAR(255);
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_new" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_special" BOOLEAN NOT NULL DEFAULT false;

-- 1) Wyodrębnij flagę Nowość! z dotychczascej nazwy
UPDATE "locations"
SET
  "is_new" = TRUE,
  "name" = TRIM(REGEXP_REPLACE("name", '\s*\(Nowość!\)\s*$', '', 'i'))
WHERE "name" ~* '\(Nowość!\)\s*$';

-- 2) Rozbij typowe lokalności: „… Przedszkole” / „… Szkoła”
UPDATE "locations"
SET
  "facility" = CASE
    WHEN "name" ~* '\sPrzedszkole$' THEN 'Przedszkole'
    WHEN "name" ~* '\sSzkoła$' THEN 'Szkoła'
    ELSE "facility"
  END,
  "town" = CASE
    WHEN "name" ~* '\sPrzedszkole$' THEN TRIM(REGEXP_REPLACE("name", '\sPrzedszkole$', '', 'i'))
    WHEN "name" ~* '\sSzkoła$' THEN TRIM(REGEXP_REPLACE("name", '\sSzkoła$', '', 'i'))
    ELSE "town"
  END
WHERE "name" ~* '\s(Przedszkole|Szkoła)$';

-- 3) Reszta (np. przygotowanie do egzaminu) → pozycje specjalne
UPDATE "locations"
SET "is_special" = TRUE
WHERE COALESCE(TRIM("town"), '') = ''
   OR COALESCE(TRIM("facility"), '') = '';

-- 4) Ujednolić name dla zwykłych lokalizacji
UPDATE "locations"
SET "name" = TRIM("town" || ' ' || "facility")
WHERE "is_special" = FALSE
  AND COALESCE(TRIM("town"), '') <> ''
  AND COALESCE(TRIM("facility"), '') <> '';
