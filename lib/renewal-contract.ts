import { queryDb } from "@/lib/db";
import type { ParentContractChildRow } from "@/lib/parent-contract";
import { getPlannedNextSchoolYear } from "@/lib/school-year-planning";

export async function fetchParentRenewalContractChildren(
  parentId: string,
  schoolId: string,
  includedRenewalIds?: string[]
): Promise<Array<ParentContractChildRow & { renewal_id: string }>> {
  const planned = await getPlannedNextSchoolYear(schoolId);
  if (!planned) return [];

  const params: unknown[] = [parentId, schoolId, planned.name];
  let idFilter = "";
  if (includedRenewalIds?.length) {
    params.push(includedRenewalIds);
    idFilter = ` AND r.id = ANY($${params.length}::text[])`;
  }

  const res = await queryDb<
    ParentContractChildRow & { renewal_id: string; teacher_pickup_consent: boolean }
  >(
    `SELECT
       c.id AS child_id,
       r.id AS renewal_id,
       r.id AS request_id,
       'ACCEPTED' AS access_level,
       c.first_name,
       c.last_name,
       c.birth_date,
       g.id AS group_id,
       g.name AS group_name,
       g.price_monthly::text AS price_monthly,
       g.price_yearly::text AS price_yearly,
       g.price_per_lesson::text AS price_per_lesson,
       c.lesson_unit_price::text AS lesson_unit_price,
       c.monthly_unit_price::text AS monthly_unit_price,
       c.yearly_unit_price::text AS yearly_unit_price,
       NULL::text AS preferred_location,
       COALESCE(MAX(l.name), NULL) AS preferred_location_name,
       u.first_name AS teacher_first_name,
       u.last_name AS teacher_last_name,
       COALESCE(g.teacher_pickup_consent, FALSE) AS teacher_pickup_consent
     FROM renewals r
     JOIN children c ON c.id = r.child_id
     JOIN groups g ON g.id = r.proposed_group_id
     LEFT JOIN schedule_templates st ON st.group_id = g.id
     LEFT JOIN locations l ON l.id = st.location_id
     LEFT JOIN users u ON u.id = g.teacher_id
     WHERE r.parent_id = $1
       AND r.school_id = $2
       AND r.season = $3
       AND UPPER(BTRIM(COALESCE(r.status::text, ''))) = 'ACCEPTED'
       AND r.proposed_group_id IS NOT NULL
       ${idFilter}
     GROUP BY
       c.id, r.id, c.first_name, c.last_name, c.birth_date,
       c.lesson_unit_price, c.monthly_unit_price, c.yearly_unit_price,
       g.id, g.name, g.price_monthly, g.price_yearly, g.price_per_lesson,
       g.teacher_pickup_consent, u.first_name, u.last_name
     ORDER BY c.last_name, c.first_name`,
    params
  );

  return res.rows.map((row) => ({
    child_id: row.child_id,
    renewal_id: row.renewal_id,
    request_id: row.request_id,
    access_level: row.access_level,
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date: row.birth_date,
    group_id: row.group_id,
    group_name: row.group_name,
    price_monthly: row.price_monthly,
    price_yearly: row.price_yearly,
    price_per_lesson: row.price_per_lesson,
    lesson_unit_price: row.lesson_unit_price,
    monthly_unit_price: row.monthly_unit_price,
    yearly_unit_price: row.yearly_unit_price,
    preferred_location: row.preferred_location,
    preferred_location_name: row.preferred_location_name,
    teacher_first_name: row.teacher_first_name,
    teacher_last_name: row.teacher_last_name,
    teacher_pickup_consent: row.teacher_pickup_consent,
  }));
}

export async function fetchParentRenewalIdsReadyForContract(
  schoolId: string,
  parentId: string
): Promise<string[]> {
  const planned = await getPlannedNextSchoolYear(schoolId);
  if (!planned) return [];

  const res = await queryDb<{ id: string }>(
    `SELECT r.id
     FROM renewals r
     WHERE r.parent_id = $1
       AND r.school_id = $2
       AND r.season = $3
       AND UPPER(BTRIM(COALESCE(r.status::text, ''))) = 'ACCEPTED'
       AND r.proposed_group_id IS NOT NULL`,
    [parentId, schoolId, planned.name]
  );
  return res.rows.map((r) => r.id);
}
