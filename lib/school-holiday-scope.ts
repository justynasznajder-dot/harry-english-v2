/**
 * Zakres dnia wolnego per grupa / placówka.
 *
 * - applies_to_preschool + applies_to_school = TRUE → wszystkie grupy
 * - jedna flaga TRUE → wszystkie grupy tego rodzaju placówki (także nowo utworzone)
 * - obie FALSE → legacy: brak wierszy w school_holiday_groups = wszyscy,
 *   inaczej tylko wymienione group_id
 */

function sqlLocationHaystack(locAlias = "loc_fac"): string {
  return `lower(COALESCE(${locAlias}.facility, '') || ' ' || COALESCE(${locAlias}.name, ''))`;
}

/** SQL: lokalizacja nie rozstrzyga placówki (brak / unknown). */
function sqlLocationFacilityUnknown(locAlias = "loc_fac", groupAlias = "g_fac"): string {
  const hay = sqlLocationHaystack(locAlias);
  return `(
    ${groupAlias}.location_id IS NULL
    OR (
      COALESCE(${locAlias}.is_special, FALSE) = FALSE
      AND ${hay} NOT LIKE '%przedszkol%'
      AND ${hay} NOT LIKE '%szkoł%'
      AND ${hay} NOT LIKE '%szkol%'
    )
  )`;
}

/** SQL: grupa `groupIdSql` to przedszkole (lokalizacja / poziom / nazwa). */
export function sqlGroupIsPreschoolFacility(groupIdSql: string): string {
  const hay = sqlLocationHaystack("loc_fac");
  return `EXISTS (
    SELECT 1
    FROM groups g_fac
    LEFT JOIN locations loc_fac ON loc_fac.id = g_fac.location_id
    WHERE g_fac.id = ${groupIdSql}
      AND (
        (
          g_fac.location_id IS NOT NULL
          AND COALESCE(loc_fac.is_special, FALSE) = FALSE
          AND ${hay} LIKE '%przedszkol%'
        )
        OR (
          ${sqlLocationFacilityUnknown("loc_fac", "g_fac")}
          AND (
            COALESCE(g_fac.level, '') IN ('P3', 'P4', 'P5', 'P6')
            OR g_fac.name ~* '^P[3-6](\\s|·|$)'
          )
        )
      )
  )`;
}

/** SQL: grupa `groupIdSql` to szkoła (lokalizacja / special / poziom / nazwa). */
export function sqlGroupIsSchoolFacility(groupIdSql: string): string {
  const hay = sqlLocationHaystack("loc_fac");
  return `EXISTS (
    SELECT 1
    FROM groups g_fac
    LEFT JOIN locations loc_fac ON loc_fac.id = g_fac.location_id
    WHERE g_fac.id = ${groupIdSql}
      AND (
        COALESCE(loc_fac.is_special, FALSE) = TRUE
        OR (
          g_fac.location_id IS NOT NULL
          AND (
            ${hay} LIKE '%szkoł%'
            OR ${hay} LIKE '%szkol%'
          )
        )
        OR (
          ${sqlLocationFacilityUnknown("loc_fac", "g_fac")}
          AND (
            COALESCE(g_fac.level, '') ~* '^Sz'
            OR g_fac.name ~* '^Sz'
          )
        )
      )
  )`;
}

function sqlLegacyGroupScope(holidayAlias: string, groupIdSql: string): string {
  return `(
    NOT EXISTS (
      SELECT 1 FROM school_holiday_groups shg_scope_all
      WHERE shg_scope_all.holiday_id = ${holidayAlias}.id
    )
    OR EXISTS (
      SELECT 1 FROM school_holiday_groups shg_scope_one
      WHERE shg_scope_one.holiday_id = ${holidayAlias}.id
        AND shg_scope_one.group_id = ${groupIdSql}
    )
  )`;
}

/** SQL: dzień wolny `h` dotyczy grupy o id = `groupIdSql` (wyrażenie SQL). */
export function sqlHolidayAppliesToGroup(
  holidayAlias = "h",
  groupIdSql: string,
): string {
  return `(
    (
      ${holidayAlias}.applies_to_preschool = TRUE
      AND ${holidayAlias}.applies_to_school = TRUE
    )
    OR (
      ${holidayAlias}.applies_to_preschool = TRUE
      AND ${sqlGroupIsPreschoolFacility(groupIdSql)}
    )
    OR (
      ${holidayAlias}.applies_to_school = TRUE
      AND ${sqlGroupIsSchoolFacility(groupIdSql)}
    )
    OR (
      ${holidayAlias}.applies_to_preschool = FALSE
      AND ${holidayAlias}.applies_to_school = FALSE
      AND ${sqlLegacyGroupScope(holidayAlias, groupIdSql)}
    )
    OR (
      (
        ${holidayAlias}.applies_to_preschool = TRUE
        OR ${holidayAlias}.applies_to_school = TRUE
      )
      AND EXISTS (
        SELECT 1 FROM school_holiday_groups shg_listed
        WHERE shg_listed.holiday_id = ${holidayAlias}.id
          AND shg_listed.group_id = ${groupIdSql}
      )
    )
  )`;
}

/**
 * SQL: dzień wolny dotyczy co najmniej jednej z grup (podzapytanie zwracające group_id)
 * albo nie ma zawężenia (wszystkie grupy / obie placówki).
 */
export function sqlHolidayAppliesToAnyGroup(
  holidayAlias = "h",
  groupIdsSubquery: string,
): string {
  return `(
    (
      ${holidayAlias}.applies_to_preschool = TRUE
      AND ${holidayAlias}.applies_to_school = TRUE
    )
    OR (
      ${holidayAlias}.applies_to_preschool = TRUE
      AND EXISTS (
        SELECT 1
        FROM groups g_any
        WHERE g_any.id IN (${groupIdsSubquery})
          AND ${sqlGroupIsPreschoolFacility("g_any.id")}
      )
    )
    OR (
      ${holidayAlias}.applies_to_school = TRUE
      AND EXISTS (
        SELECT 1
        FROM groups g_any
        WHERE g_any.id IN (${groupIdsSubquery})
          AND ${sqlGroupIsSchoolFacility("g_any.id")}
      )
    )
    OR (
      ${holidayAlias}.applies_to_preschool = FALSE
      AND ${holidayAlias}.applies_to_school = FALSE
      AND (
        NOT EXISTS (
          SELECT 1 FROM school_holiday_groups shg_scope_all
          WHERE shg_scope_all.holiday_id = ${holidayAlias}.id
        )
        OR EXISTS (
          SELECT 1 FROM school_holiday_groups shg_scope_one
          WHERE shg_scope_one.holiday_id = ${holidayAlias}.id
            AND shg_scope_one.group_id IN (${groupIdsSubquery})
        )
      )
    )
    OR (
      (
        ${holidayAlias}.applies_to_preschool = TRUE
        OR ${holidayAlias}.applies_to_school = TRUE
      )
      AND EXISTS (
        SELECT 1 FROM school_holiday_groups shg_listed
        WHERE shg_listed.holiday_id = ${holidayAlias}.id
          AND shg_listed.group_id IN (${groupIdsSubquery})
      )
    )
  )`;
}
