-- Zakres placówek dnia wolnego: blokuje też przyszłe grupy przedszkolne / szkolne.

ALTER TABLE "school_holidays"
  ADD COLUMN "applies_to_preschool" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "applies_to_school" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: ustaw flagę placówki tylko gdy holiday obejmuje WSZYSTKIE aktywne
-- grupy tego typu w szkole (nie podzbiór). Puste school_holiday_groups = legacy „wszyscy”.
WITH group_kind AS (
  SELECT
    g.id AS group_id,
    g.school_id,
    CASE
      WHEN g.location_id IS NOT NULL
        AND COALESCE(loc.is_special, FALSE) = FALSE
        AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) LIKE '%przedszkol%'
        THEN 'preschool'
      WHEN COALESCE(loc.is_special, FALSE) = TRUE
        OR (
          g.location_id IS NOT NULL
          AND (
            lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) LIKE '%szkoł%'
            OR lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) LIKE '%szkol%'
          )
        )
        THEN 'school'
      WHEN (
        g.location_id IS NULL
        OR (
          COALESCE(loc.is_special, FALSE) = FALSE
          AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) NOT LIKE '%przedszkol%'
          AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) NOT LIKE '%szkoł%'
          AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) NOT LIKE '%szkol%'
        )
      )
      AND (
        COALESCE(g.level, '') IN ('P3', 'P4', 'P5', 'P6')
        OR g.name ~* '^P[3-6](\\s|·|$)'
      )
        THEN 'preschool'
      WHEN (
        g.location_id IS NULL
        OR (
          COALESCE(loc.is_special, FALSE) = FALSE
          AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) NOT LIKE '%przedszkol%'
          AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) NOT LIKE '%szkoł%'
          AND lower(COALESCE(loc.facility, '') || ' ' || COALESCE(loc.name, '')) NOT LIKE '%szkol%'
        )
      )
      AND (
        COALESCE(g.level, '') ~* '^Sz'
        OR g.name ~* '^Sz'
      )
        THEN 'school'
      ELSE 'unknown'
    END AS kind
  FROM groups g
  LEFT JOIN locations loc ON loc.id = g.location_id
  WHERE g.deleted_at IS NULL
    AND g.active = TRUE
),
holiday_scope AS (
  SELECT
    h.id AS holiday_id,
    h.school_id,
    COUNT(*) FILTER (WHERE gk.kind = 'preschool') AS scoped_preschool,
    COUNT(*) FILTER (WHERE gk.kind = 'school') AS scoped_school
  FROM school_holidays h
  INNER JOIN school_holiday_groups shg ON shg.holiday_id = h.id
  LEFT JOIN group_kind gk ON gk.group_id = shg.group_id
  GROUP BY h.id, h.school_id
),
school_totals AS (
  SELECT
    school_id,
    COUNT(*) FILTER (WHERE kind = 'preschool') AS total_preschool,
    COUNT(*) FILTER (WHERE kind = 'school') AS total_school
  FROM group_kind
  GROUP BY school_id
)
UPDATE school_holidays h
SET
  applies_to_preschool = (
    hs.scoped_preschool > 0
    AND st.total_preschool > 0
    AND hs.scoped_preschool >= st.total_preschool
  ),
  applies_to_school = (
    hs.scoped_school > 0
    AND st.total_school > 0
    AND hs.scoped_school >= st.total_school
  )
FROM holiday_scope hs
INNER JOIN school_totals st ON st.school_id = hs.school_id
WHERE h.id = hs.holiday_id;
