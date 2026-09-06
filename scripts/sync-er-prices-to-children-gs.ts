/**
 * Sync cen z enrollment_requests → children + group_students.
 * Źródło prawdy: enrollment_requests (nadpisuje children i group_students).
 *
 * Użycie:
 *   npx tsx scripts/sync-er-prices-to-children-gs.ts           # dry-run
 *   $env:CONFIRM="1"; npx tsx scripts/sync-er-prices-to-children-gs.ts
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const CONFIRM = process.env.CONFIRM === "1";

async function main() {
  const { queryDb, runPgTransaction } = await import("../lib/db");

  const rows = await queryDb<{
    er_id: string;
    school_id: string;
    child_id: string;
    er_lesson: string | null;
    er_monthly: string | null;
    er_yearly: string | null;
    c_lesson: string | null;
    c_monthly: string | null;
    c_yearly: string | null;
    gs_count: string;
    gs_matching: string;
  }>(
    `SELECT er.id AS er_id,
            er.school_id,
            c.id AS child_id,
            er.lesson_unit_price::text AS er_lesson,
            er.monthly_unit_price::text AS er_monthly,
            er.yearly_unit_price::text AS er_yearly,
            c.lesson_unit_price::text AS c_lesson,
            c.monthly_unit_price::text AS c_monthly,
            c.yearly_unit_price::text AS c_yearly,
            (SELECT COUNT(*)::text FROM group_students gs WHERE gs.child_id = c.id) AS gs_count,
            (SELECT COUNT(*)::text
               FROM group_students gs
              WHERE gs.child_id = c.id
                AND gs.lesson_unit_price IS NOT DISTINCT FROM er.lesson_unit_price
                AND gs.monthly_unit_price IS NOT DISTINCT FROM er.monthly_unit_price
                AND gs.yearly_unit_price IS NOT DISTINCT FROM er.yearly_unit_price
            ) AS gs_matching
     FROM enrollment_requests er
     JOIN children c ON c.enrollment_request_id = er.id
     WHERE er.lesson_unit_price IS NOT NULL
        OR er.monthly_unit_price IS NOT NULL
        OR er.yearly_unit_price IS NOT NULL
     ORDER BY er.school_id, er.id`
  );

  const eq = (a: string | null, b: string | null) => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Number(a) === Number(b);
  };

  let childAlreadyOk = 0;
  let childNeedsUpdate = 0;
  let gsNeedsUpdate = 0;
  let gsAlreadyOk = 0;
  const bySchool: Record<string, { total: number; childUpdate: number; gsUpdate: number }> = {};
  const mismatchSamples: Array<Record<string, unknown>> = [];

  for (const r of rows.rows) {
    const school = (bySchool[r.school_id] ??= { total: 0, childUpdate: 0, gsUpdate: 0 });
    school.total += 1;

    const childOk =
      eq(r.er_lesson, r.c_lesson) &&
      eq(r.er_monthly, r.c_monthly) &&
      eq(r.er_yearly, r.c_yearly);

    if (childOk) childAlreadyOk += 1;
    else {
      childNeedsUpdate += 1;
      school.childUpdate += 1;
      if (mismatchSamples.length < 10) {
        mismatchSamples.push({
          er_id: r.er_id,
          child_id: r.child_id,
          er: `${r.er_lesson}/${r.er_monthly}/${r.er_yearly}`,
          children: `${r.c_lesson}/${r.c_monthly}/${r.c_yearly}`,
        });
      }
    }

    const gsTotal = Number(r.gs_count);
    const gsMatch = Number(r.gs_matching);
    if (gsTotal === 0) {
      // nothing
    } else if (gsMatch === gsTotal && childOk) {
      gsAlreadyOk += 1;
    } else if (gsMatch < gsTotal || !childOk) {
      // if child needs update, gs will be set to ER too
      gsNeedsUpdate += 1;
      school.gsUpdate += 1;
    } else {
      gsAlreadyOk += 1;
    }
  }

  const erNoChild = await queryDb<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM enrollment_requests er
     WHERE (er.lesson_unit_price IS NOT NULL
         OR er.monthly_unit_price IS NOT NULL
         OR er.yearly_unit_price IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM children c WHERE c.enrollment_request_id = er.id
       )`
  );

  console.log(
    JSON.stringify(
      {
        mode: CONFIRM ? "APPLY" : "DRY_RUN",
        erWithChildAndPrice: rows.rows.length,
        erWithPriceNoChild: Number(erNoChild.rows[0]?.cnt ?? 0),
        childAlreadyOk,
        childNeedsUpdate,
        gsRowsChildrenAlreadyOk: gsAlreadyOk,
        childrenWithGsNeedingUpdate: gsNeedsUpdate,
        bySchool,
        mismatchSamples,
      },
      null,
      2
    )
  );

  if (!CONFIRM) {
    console.log(
      'Dry-run OK. Aby zapisać: $env:CONFIRM="1"; npx tsx scripts/sync-er-prices-to-children-gs.ts'
    );
    return;
  }

  let updatedChildren = 0;
  let updatedGs = 0;

  await runPgTransaction(async (client) => {
    for (const r of rows.rows) {
      const childRes = await client.query(
        `UPDATE children
         SET lesson_unit_price = $2,
             monthly_unit_price = $3,
             yearly_unit_price = $4
         WHERE id = $1
           AND (
             lesson_unit_price IS DISTINCT FROM $2::numeric
             OR monthly_unit_price IS DISTINCT FROM $3::numeric
             OR yearly_unit_price IS DISTINCT FROM $4::numeric
           )`,
        [r.child_id, r.er_lesson, r.er_monthly, r.er_yearly]
      );
      updatedChildren += childRes.rowCount ?? 0;

      const gsRes = await client.query(
        `UPDATE group_students
         SET lesson_unit_price = $2,
             monthly_unit_price = $3,
             yearly_unit_price = $4
         WHERE child_id = $1
           AND (
             lesson_unit_price IS DISTINCT FROM $2::numeric
             OR monthly_unit_price IS DISTINCT FROM $3::numeric
             OR yearly_unit_price IS DISTINCT FROM $4::numeric
           )`,
        [r.child_id, r.er_lesson, r.er_monthly, r.er_yearly]
      );
      updatedGs += gsRes.rowCount ?? 0;
    }
  });

  // verify
  const after = await queryDb<{
    child_mismatch: string;
    gs_mismatch: string;
    all_three_ok: string;
  }>(
    `WITH linked AS (
       SELECT er.id AS er_id,
              c.id AS child_id,
              er.lesson_unit_price AS er_l,
              er.monthly_unit_price AS er_m,
              er.yearly_unit_price AS er_y,
              c.lesson_unit_price AS c_l,
              c.monthly_unit_price AS c_m,
              c.yearly_unit_price AS c_y
       FROM enrollment_requests er
       JOIN children c ON c.enrollment_request_id = er.id
       WHERE er.lesson_unit_price IS NOT NULL
          OR er.monthly_unit_price IS NOT NULL
          OR er.yearly_unit_price IS NOT NULL
     )
     SELECT
       (SELECT COUNT(*)::text FROM linked
         WHERE er_l IS DISTINCT FROM c_l
            OR er_m IS DISTINCT FROM c_m
            OR er_y IS DISTINCT FROM c_y) AS child_mismatch,
       (SELECT COUNT(*)::text
          FROM linked l
          JOIN group_students gs ON gs.child_id = l.child_id
         WHERE gs.lesson_unit_price IS DISTINCT FROM l.er_l
            OR gs.monthly_unit_price IS DISTINCT FROM l.er_m
            OR gs.yearly_unit_price IS DISTINCT FROM l.er_y) AS gs_mismatch,
       (SELECT COUNT(*)::text FROM linked l
         WHERE l.er_l IS NOT DISTINCT FROM l.c_l
           AND l.er_m IS NOT DISTINCT FROM l.c_m
           AND l.er_y IS NOT DISTINCT FROM l.c_y
           AND EXISTS (SELECT 1 FROM group_students gs WHERE gs.child_id = l.child_id)
           AND NOT EXISTS (
             SELECT 1 FROM group_students gs
              WHERE gs.child_id = l.child_id
                AND (gs.lesson_unit_price IS DISTINCT FROM l.er_l
                  OR gs.monthly_unit_price IS DISTINCT FROM l.er_m
                  OR gs.yearly_unit_price IS DISTINCT FROM l.er_y)
           )) AS all_three_ok`
  );

  console.log(
    JSON.stringify(
      {
        updatedChildren,
        updatedGroupStudents: updatedGs,
        verify: after.rows[0],
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
