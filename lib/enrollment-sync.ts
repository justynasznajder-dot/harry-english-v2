import { randomUUID } from "crypto";
import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { parsePriceDecimal } from "@/lib/lesson-pricing";

export type GroupStudentPriceOverrides = {
  lessonUnitPrice?: string | number | null;
  monthlyUnitPrice?: string | number | null;
  yearlyUnitPrice?: string | number | null;
  /** Rok członkostwa; domyślnie aktywny rok szkoły grupy. */
  schoolYearId?: string | null;
  /** Gdy true, zapisuje podane stawki też na profilu dziecka. */
  persistToChild?: boolean;
};

/** Ustawia `users.access_level` rodzica: ACTIVE gdy ma aktywne dziecko SIGNED/COMPLETED, inaczej PENDING. */
export async function syncParentUserAccessLevel(parentId: string): Promise<void> {
  await queryDb(
    `UPDATE users
     SET access_level = CASE
       WHEN EXISTS (
         SELECT 1 FROM children
         WHERE parent_id = $1
           AND active = TRUE
           AND UPPER(BTRIM(COALESCE(access_level::text, ''))) IN ('SIGNED', 'COMPLETED')
       ) THEN 'ACTIVE'
       ELSE 'PENDING'
     END
     WHERE id = $1
       AND role = 'PARENT'`,
    [parentId]
  );
}

/** Synchronizuje `children.access_level` dla dzieci powiązanych ze zgłoszeniem enrollment. */
export async function syncChildrenAccessLevelForEnrollment(
  enrollmentRequestId: string,
  accessLevel: EnrollmentStatus
): Promise<void> {
  await queryDb(
    `UPDATE children
     SET access_level = $2
     WHERE enrollment_request_id = $1`,
    [enrollmentRequestId, accessLevel]
  );
}

async function resolveMembershipPrices(
  childId: string,
  options?: GroupStudentPriceOverrides
): Promise<{
  lessonUnitPrice: number | null;
  monthlyUnitPrice: number | null;
  yearlyUnitPrice: number | null;
  persistPrices: {
    lessonUnitPrice?: number | null;
    monthlyUnitPrice?: number | null;
    yearlyUnitPrice?: number | null;
  } | null;
}> {
  const childPrices = await queryDb<{
    lesson_unit_price: string | null;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
  }>(
    `SELECT
       lesson_unit_price::text AS lesson_unit_price,
       monthly_unit_price::text AS monthly_unit_price,
       yearly_unit_price::text AS yearly_unit_price
     FROM children
     WHERE id = $1
     LIMIT 1`,
    [childId]
  );
  const row = childPrices.rows[0];
  let lessonUnitPrice = parsePriceDecimal(row?.lesson_unit_price);
  let monthlyUnitPrice = parsePriceDecimal(row?.monthly_unit_price);
  let yearlyUnitPrice = parsePriceDecimal(row?.yearly_unit_price);

  const persistPrices: {
    lessonUnitPrice?: number | null;
    monthlyUnitPrice?: number | null;
    yearlyUnitPrice?: number | null;
  } = {};

  if (options != null && "lessonUnitPrice" in options) {
    const v = parsePriceDecimal(options.lessonUnitPrice);
    if (v != null) {
      lessonUnitPrice = v;
      persistPrices.lessonUnitPrice = v;
    }
  }
  if (options != null && "monthlyUnitPrice" in options) {
    const v = parsePriceDecimal(options.monthlyUnitPrice);
    if (v != null) {
      monthlyUnitPrice = v;
      persistPrices.monthlyUnitPrice = v;
    }
  }
  if (options != null && "yearlyUnitPrice" in options) {
    const v = parsePriceDecimal(options.yearlyUnitPrice);
    if (v != null) {
      yearlyUnitPrice = v;
      persistPrices.yearlyUnitPrice = v;
    }
  }

  if (options?.persistToChild === true) {
    if ("lessonUnitPrice" in (options ?? {})) {
      persistPrices.lessonUnitPrice = parsePriceDecimal(options.lessonUnitPrice);
    }
    if ("monthlyUnitPrice" in (options ?? {})) {
      persistPrices.monthlyUnitPrice = parsePriceDecimal(options.monthlyUnitPrice);
    }
    if ("yearlyUnitPrice" in (options ?? {})) {
      persistPrices.yearlyUnitPrice = parsePriceDecimal(options.yearlyUnitPrice);
    }
  }

  const hasPersist = Object.keys(persistPrices).length > 0;
  return {
    lessonUnitPrice,
    monthlyUnitPrice,
    yearlyUnitPrice,
    persistPrices: hasPersist ? persistPrices : null,
  };
}

/** Zapisuje indywidualne stawki na profilu dziecka i opcjonalnie lustro na aktywnych członkostwach. */
export async function updateChildPriceOverrides(
  childId: string,
  schoolId: string,
  prices: {
    lessonUnitPrice?: number | null;
    monthlyUnitPrice?: number | null;
    yearlyUnitPrice?: number | null;
  }
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [childId, schoolId];
  let idx = 3;

  if (prices.lessonUnitPrice !== undefined) {
    sets.push(`lesson_unit_price = $${idx++}`);
    values.push(prices.lessonUnitPrice);
  }
  if (prices.monthlyUnitPrice !== undefined) {
    sets.push(`monthly_unit_price = $${idx++}`);
    values.push(prices.monthlyUnitPrice);
  }
  if (prices.yearlyUnitPrice !== undefined) {
    sets.push(`yearly_unit_price = $${idx++}`);
    values.push(prices.yearlyUnitPrice);
  }
  if (sets.length === 0) return false;

  const updated = await queryDb<{ id: string }>(
    `UPDATE children
     SET ${sets.join(", ")}
     WHERE id = $1 AND school_id = $2
     RETURNING id`,
    values
  );
  if (!updated.rows[0]) return false;

  // Lustro na aktywnych członkostwach (legacy / przenoszenie roku) — źródłem prawdy jest children.
  const mirrorSets: string[] = [];
  const mirrorValues: unknown[] = [childId, schoolId];
  let mIdx = 3;
  if (prices.lessonUnitPrice !== undefined) {
    mirrorSets.push(`lesson_unit_price = $${mIdx++}`);
    mirrorValues.push(prices.lessonUnitPrice);
  }
  if (prices.monthlyUnitPrice !== undefined) {
    mirrorSets.push(`monthly_unit_price = $${mIdx++}`);
    mirrorValues.push(prices.monthlyUnitPrice);
  }
  if (prices.yearlyUnitPrice !== undefined) {
    mirrorSets.push(`yearly_unit_price = $${mIdx++}`);
    mirrorValues.push(prices.yearlyUnitPrice);
  }
  if (mirrorSets.length > 0) {
    await queryDb(
      `UPDATE group_students
       SET ${mirrorSets.join(", ")}
       WHERE child_id = $1
         AND school_id = $2
         AND left_at IS NULL`,
      mirrorValues
    );
  }

  return true;
}

/** Dodaje dziecko do grupy (`group_students`) w danym roku, jeśli nie jest już aktywnie przypisane. */
export async function enrollChildInGroup(
  childId: string,
  groupId: string,
  options?: GroupStudentPriceOverrides
): Promise<boolean> {
  if (!groupId) return false;

  const groupRow = await queryDb<{ school_id: string }>(
    `SELECT school_id FROM groups WHERE id = $1 LIMIT 1`,
    [groupId]
  );
  if (!groupRow.rows[0]) return false;
  const schoolId = groupRow.rows[0].school_id;

  let schoolYearId = options?.schoolYearId ?? null;
  if (!schoolYearId) {
    const activeYear = await getActiveSchoolYear(schoolId);
    schoolYearId = typeof activeYear?.id === "string" ? activeYear.id : null;
  }

  const active = await queryDb<{ id: string }>(
    `SELECT id FROM group_students
     WHERE group_id = $1
       AND child_id = $2
       AND school_year_id IS NOT DISTINCT FROM $3
       AND left_at IS NULL
     LIMIT 1`,
    [groupId, childId, schoolYearId]
  );
  if (active.rows[0]) return false;

  const { lessonUnitPrice, monthlyUnitPrice, yearlyUnitPrice, persistPrices } =
    await resolveMembershipPrices(childId, options);

  if (persistPrices) {
    await updateChildPriceOverrides(childId, schoolId, persistPrices);
  }

  const prior = await queryDb<{ id: string; left_at: string | null }>(
    `SELECT id, left_at::text FROM group_students
     WHERE group_id = $1 AND child_id = $2 AND school_year_id IS NOT DISTINCT FROM $3
     LIMIT 1`,
    [groupId, childId, schoolYearId]
  );
  if (prior.rows[0]) {
    if (prior.rows[0].left_at == null) return false;
    await queryDb(
      `UPDATE group_students
       SET left_at = NULL,
           enrolled_at = NOW(),
           school_id = $2,
           lesson_unit_price = $3,
           monthly_unit_price = $4,
           yearly_unit_price = $5
       WHERE id = $1`,
      [
        prior.rows[0].id,
        schoolId,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
      ]
    );
  } else {
    await queryDb(
      `INSERT INTO group_students (
         id, school_id, group_id, child_id, enrolled_at, school_year_id,
         lesson_unit_price, monthly_unit_price, yearly_unit_price
       ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)`,
      [
        randomUUID(),
        schoolId,
        groupId,
        childId,
        schoolYearId,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
      ]
    );
  }
  return true;
}

/** Przypisuje wszystkie dzieci ze zgłoszenia do proponowanej grupy. */
export async function enrollChildrenForEnrollmentRequest(
  enrollmentRequestId: string,
  schoolYearId?: string | null
): Promise<void> {
  const res = await queryDb<{ child_id: string; group_id: string | null }>(
    `SELECT c.id AS child_id, er.proposed_group_id AS group_id
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     WHERE c.enrollment_request_id = $1`,
    [enrollmentRequestId]
  );
  for (const row of res.rows) {
    if (row.group_id) {
      await enrollChildInGroup(row.child_id, row.group_id, { schoolYearId });
    }
  }
}
