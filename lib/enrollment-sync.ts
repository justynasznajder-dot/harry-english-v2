import { randomUUID } from "crypto";
import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { getActiveSchoolYear, queryDb, runPgTransaction } from "@/lib/db";
import { allocateChildClientNumber } from "@/lib/client-numbers";
import { formatPersonName } from "@/lib/format-person-name";
import { parsePriceDecimal } from "@/lib/lesson-pricing";
import { normalizeLessonsPerWeek } from "@/lib/lessons-per-week";

export type GroupStudentPriceOverrides = {
  lessonUnitPrice?: string | number | null;
  monthlyUnitPrice?: string | number | null;
  yearlyUnitPrice?: string | number | null;
  /** Rok członkostwa; domyślnie aktywny rok szkoły grupy. */
  schoolYearId?: string | null;
  /** Gdy true, zapisuje podane stawki też na profilu dziecka. */
  persistToChild?: boolean;
  /** Ile razy w tygodniu dziecko uczęszcza (1 lub 2). */
  lessonsPerWeek?: number | null;
};

/** Ustawia `users.access_level` rodzica: ACTIVE gdy ma aktywne dziecko SIGNED/COMPLETED, inaczej PENDING.
 *  Dodatkowo: `confirmed = TRUE`, gdy rodzic ma co najmniej jedną umowę SIGNED (nie cofa flagi).
 */
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
     END,
     confirmed = CASE
       WHEN EXISTS (
         SELECT 1 FROM contracts
         WHERE parent_id = $1
           AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'SIGNED'
       ) THEN TRUE
       ELSE confirmed
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

/**
 * Tworzy brakujące rekordy `children` ze zgłoszeń (`enrollment_requests`),
 * które mają już `user_id`, ale nie mają jeszcze dziecka w bazie.
 * Potrzebne m.in. gdy konto rodzica powstało z trybu bez opłat przed propozycją grupy.
 */
export async function ensureChildrenFromEnrollmentRequests(
  schoolId: string,
  parentUserId?: string | null
): Promise<number> {
  const parentFilter = String(parentUserId ?? "").trim();
  const pending = await queryDb<{
    er_id: string;
    parent_user_id: string;
    child_first_name: string;
    child_last_name: string;
    child_birth_date: string;
    status: string;
    lesson_unit_price: string | null;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
  }>(
    `SELECT
       er.id AS er_id,
       er.user_id AS parent_user_id,
       er.child_first_name,
       er.child_last_name,
       er.child_birth_date::date::text AS child_birth_date,
       UPPER(BTRIM(COALESCE(er.status::text, 'NEW'))) AS status,
       er.lesson_unit_price::text AS lesson_unit_price,
       er.monthly_unit_price::text AS monthly_unit_price,
       er.yearly_unit_price::text AS yearly_unit_price
     FROM enrollment_requests er
     WHERE er.school_id = $1
       AND er.user_id IS NOT NULL
       AND BTRIM(COALESCE(er.child_first_name, '')) <> ''
       AND BTRIM(COALESCE(er.child_last_name, '')) <> ''
       AND ($2 = '' OR er.user_id = $2)
       AND NOT EXISTS (
         SELECT 1 FROM children c
         WHERE c.school_id = er.school_id
           AND (
             c.enrollment_request_id = er.id
             OR (
               c.parent_id = er.user_id
               AND LOWER(BTRIM(c.first_name)) = LOWER(BTRIM(er.child_first_name))
               AND LOWER(BTRIM(c.last_name)) = LOWER(BTRIM(er.child_last_name))
             )
           )
       )`,
    [schoolId, parentFilter]
  );

  let created = 0;
  for (const row of pending.rows) {
    const childFirst = formatPersonName(row.child_first_name);
    const childLast = formatPersonName(row.child_last_name);
    const birth = String(row.child_birth_date ?? "").slice(0, 10);
    if (!childFirst || !childLast || !birth) continue;

    const accessLevel = row.status || "NEW";
    const childId = randomUUID();

    await runPgTransaction(async (client) => {
      const childClientNumber = await allocateChildClientNumber(
        client,
        schoolId,
        row.parent_user_id
      );
      await client.query(
        `INSERT INTO children (
           id, school_id, parent_id, client_number, first_name, last_name, birth_date,
           active, confirmed, enrollment_request_id, access_level,
           lesson_unit_price, monthly_unit_price, yearly_unit_price
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, TRUE, FALSE, $8, $9, $10, $11, $12)`,
        [
          childId,
          schoolId,
          row.parent_user_id,
          childClientNumber,
          childFirst,
          childLast,
          birth,
          row.er_id,
          accessLevel,
          parsePriceDecimal(row.lesson_unit_price),
          parsePriceDecimal(row.monthly_unit_price),
          parsePriceDecimal(row.yearly_unit_price),
        ]
      );
    });
    created += 1;
  }

  return created;
}

/**
 * Kopiuje stawki ze zgłoszenia na powiązane profile dzieci, gdy profil nie ma jeszcze żadnej stawki.
 * Nie nadpisuje ręcznie ustawionych stawek na `children`.
 */
export async function syncEnrollmentPricesOntoChildren(options?: {
  enrollmentRequestId?: string;
}): Promise<number> {
  const requestId = String(options?.enrollmentRequestId ?? "").trim();
  const res = await queryDb<{ id: string }>(
    `UPDATE children c
     SET lesson_unit_price = er.lesson_unit_price,
         monthly_unit_price = er.monthly_unit_price,
         yearly_unit_price = er.yearly_unit_price
     FROM enrollment_requests er
     WHERE c.enrollment_request_id = er.id
       AND ($1 = '' OR er.id = $1)
       AND c.lesson_unit_price IS NULL
       AND c.monthly_unit_price IS NULL
       AND c.yearly_unit_price IS NULL
       AND (
         er.lesson_unit_price IS NOT NULL
         OR er.monthly_unit_price IS NOT NULL
         OR er.yearly_unit_price IS NOT NULL
       )
     RETURNING c.id`,
    [requestId]
  );
  return res.rowCount ?? res.rows.length;
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

/** Kończy aktywne członkostwo dziecka w danej grupie (`left_at = NOW()`). */
export async function leaveChildFromGroup(
  childId: string,
  groupId: string
): Promise<boolean> {
  if (!childId || !groupId) return false;
  const res = await queryDb<{ id: string }>(
    `UPDATE group_students
     SET left_at = NOW()
     WHERE child_id = $1
       AND group_id = $2
       AND left_at IS NULL
     RETURNING id`,
    [childId, groupId]
  );
  return Boolean(res.rows[0]);
}

/**
 * Po usunięciu ucznia z grupy: jeśli zgłoszenie wskazuje tę samą grupę
 * i proces zapisu nie jest zakończony — cofnij na „Nowe zgłoszenie”.
 * Nie rusza SIGNED / COMPLETED / REJECTED.
 */
export async function clearEnrollmentGroupAssignmentAfterLeave(
  childId: string,
  groupId: string,
  schoolId: string
): Promise<boolean> {
  if (!childId || !groupId || !schoolId) return false;

  const res = await queryDb<{ id: string }>(
    `UPDATE enrollment_requests er
     SET status = 'NEW'::enrollment_status,
         proposed_group_id = NULL,
         proposed_at = NULL
     FROM children c
     WHERE c.id = $1
       AND c.school_id = $3
       AND er.id = c.enrollment_request_id
       AND er.school_id = $3
       AND er.proposed_group_id = $2
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) NOT IN (
         'SIGNED', 'COMPLETED', 'REJECTED'
       )
     RETURNING er.id`,
    [childId, groupId, schoolId]
  );

  const enrollmentId = res.rows[0]?.id;
  if (!enrollmentId) return false;

  await syncChildrenAccessLevelForEnrollment(enrollmentId, "NEW");
  await queryDb(
    `UPDATE children
     SET confirmed = FALSE
     WHERE id = $1
       AND school_id = $2`,
    [childId, schoolId]
  );
  return true;
}

/** Czy dziecko ma podpisaną umowę (status SIGNED). */
export async function childHasSignedContract(childId: string): Promise<boolean> {
  if (!childId) return false;
  const res = await queryDb<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM contracts ct
       JOIN contract_children cc ON cc.contract_id = ct.id
       WHERE cc.child_id = $1
         AND UPPER(BTRIM(COALESCE(ct.status::text, ''))) = 'SIGNED'
     ) AS ok`,
    [childId]
  );
  return res.rows[0]?.ok === true;
}

/** Przypisuje dziecko do grupy; przy zmianie grupy zamyka poprzednie członkostwo. */
export async function assignChildToProposedGroup(
  childId: string,
  newGroupId: string,
  options?: GroupStudentPriceOverrides & { previousGroupId?: string | null }
): Promise<void> {
  const previous = options?.previousGroupId?.trim() || null;
  if (previous && previous !== newGroupId) {
    await leaveChildFromGroup(childId, previous);
  }
  await enrollChildInGroup(childId, newGroupId, options);
}

/** Dodaje dziecko do grupy (`group_students`) w danym roku, jeśli nie jest już aktywnie przypisane. */
export async function enrollChildInGroup(
  childId: string,
  groupId: string,
  options?: GroupStudentPriceOverrides
): Promise<boolean> {
  if (!groupId) return false;

  const groupRow = await queryDb<{ school_id: string; lessons_per_week: number | null }>(
    `SELECT school_id, lessons_per_week FROM groups WHERE id = $1 LIMIT 1`,
    [groupId]
  );
  if (!groupRow.rows[0]) return false;
  const schoolId = groupRow.rows[0].school_id;
  const groupLpw = normalizeLessonsPerWeek(groupRow.rows[0].lessons_per_week) ?? 1;
  const membershipLpw =
    normalizeLessonsPerWeek(options?.lessonsPerWeek) ??
    (groupLpw <= 1 ? 1 : 2);

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
  if (active.rows[0]) {
    const { lessonUnitPrice, monthlyUnitPrice, yearlyUnitPrice, persistPrices } =
      await resolveMembershipPrices(childId, options);
    if (persistPrices) {
      await updateChildPriceOverrides(childId, schoolId, persistPrices);
    }
    await queryDb(
      `UPDATE group_students
       SET lesson_unit_price = $2,
           monthly_unit_price = $3,
           yearly_unit_price = $4,
           lessons_per_week = COALESCE($5, lessons_per_week)
       WHERE id = $1`,
      [
        active.rows[0].id,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
        normalizeLessonsPerWeek(options?.lessonsPerWeek),
      ]
    );
    return false;
  }

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
           yearly_unit_price = $5,
           lessons_per_week = $6
       WHERE id = $1`,
      [
        prior.rows[0].id,
        schoolId,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
        membershipLpw,
      ]
    );
  } else {
    await queryDb(
      `INSERT INTO group_students (
         id, school_id, group_id, child_id, enrolled_at, school_year_id,
         lesson_unit_price, monthly_unit_price, yearly_unit_price, lessons_per_week
       ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        schoolId,
        groupId,
        childId,
        schoolYearId,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
        membershipLpw,
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
  const res = await queryDb<{
    child_id: string;
    group_id: string | null;
    lessons_per_week: number | null;
  }>(
    `SELECT c.id AS child_id, er.proposed_group_id AS group_id, er.lessons_per_week
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     WHERE c.enrollment_request_id = $1`,
    [enrollmentRequestId]
  );
  for (const row of res.rows) {
    if (row.group_id) {
      await enrollChildInGroup(row.child_id, row.group_id, {
        schoolYearId,
        lessonsPerWeek: row.lessons_per_week,
      });
    }
  }
}
