/**
 * Zakres dnia wolnego per grupa.
 * Brak wierszy w school_holiday_groups dla holiday_id = dotyczy wszystkich grup.
 */

/** SQL: dzień wolny `h` dotyczy grupy o id = `groupIdSql` (wyrażenie SQL). */
export function sqlHolidayAppliesToGroup(
  holidayAlias = "h",
  groupIdSql: string,
): string {
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

/**
 * SQL: dzień wolny dotyczy co najmniej jednej z grup (podzapytanie zwracające group_id)
 * albo nie ma zawężenia (wszystkie grupy).
 */
export function sqlHolidayAppliesToAnyGroup(
  holidayAlias = "h",
  groupIdsSubquery: string,
): string {
  return `(
    NOT EXISTS (
      SELECT 1 FROM school_holiday_groups shg_scope_all
      WHERE shg_scope_all.holiday_id = ${holidayAlias}.id
    )
    OR EXISTS (
      SELECT 1 FROM school_holiday_groups shg_scope_one
      WHERE shg_scope_one.holiday_id = ${holidayAlias}.id
        AND shg_scope_one.group_id IN (${groupIdsSubquery})
    )
  )`;
}
