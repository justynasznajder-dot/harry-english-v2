import pg from "pg";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import { computeSchoolYearTeacherStats } from "../lib/school-year-history";

dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function backfillPaymentsSchoolYearId(): Promise<number> {
  const fromContract = await pool.query(
    `UPDATE payments p
     SET school_year_id = c.school_year_id
     FROM contracts c
     WHERE p.contract_id = c.id
       AND p.school_year_id IS NULL
       AND c.school_year_id IS NOT NULL`
  );
  console.log("payments from contract:", fromContract.rowCount ?? 0);

  const fromPeriod = await pool.query(
    `UPDATE payments p
     SET school_year_id = sy.id
     FROM school_years sy
     WHERE p.school_year_id IS NULL
       AND p.period_month IS NOT NULL
       AND p.school_id = sy.school_id
       AND p.period_month >= sy.date_from
       AND p.period_month <= sy.date_to`
  );
  console.log("payments from period_month:", fromPeriod.rowCount ?? 0);

  const fromDueDate = await pool.query(
    `UPDATE payments p
     SET school_year_id = sy.id
     FROM school_years sy
     WHERE p.school_year_id IS NULL
       AND p.due_date IS NOT NULL
       AND p.school_id = sy.school_id
       AND p.due_date >= sy.date_from
       AND p.due_date <= sy.date_to`
  );
  console.log("payments from due_date:", fromDueDate.rowCount ?? 0);

  return (
    (fromContract.rowCount ?? 0) +
    (fromPeriod.rowCount ?? 0) +
    (fromDueDate.rowCount ?? 0)
  );
}

async function backfillLessonBillingSchoolYearId(): Promise<number> {
  const res = await pool.query(
    `UPDATE lesson_billing_periods lbp
     SET school_year_id = sy.id
     FROM school_years sy
     WHERE lbp.school_year_id IS NULL
       AND lbp.school_id = sy.school_id
       AND lbp.period_month >= sy.date_from
       AND lbp.period_month <= sy.date_to`
  );
  console.log("lesson_billing_periods:", res.rowCount ?? 0);
  return res.rowCount ?? 0;
}

async function backfillGroupStudentsSchoolYearId(): Promise<number> {
  // Po migracji groups_drop_school_year_id kolumna g.school_year_id znika — pomiń ten krok.
  const col = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'groups' AND column_name = 'school_year_id'
     ) AS exists`
  );
  if (!col.rows[0]?.exists) {
    console.log("groups.school_year_id already dropped — skip membership backfill from groups.");
    return 0;
  }
  const res = await pool.query(
    `UPDATE group_students gs
     SET school_year_id = g.school_year_id
     FROM groups g
     WHERE g.id = gs.group_id
       AND gs.school_year_id IS NULL
       AND g.school_year_id IS NOT NULL`
  );
  console.log("group_students school_year_id:", res.rowCount ?? 0);
  return res.rowCount ?? 0;
}

async function backfillClosedYearStats(): Promise<number> {
  const years = await pool.query<{ id: string; school_id: string; name: string }>(
    `SELECT id, school_id, name
     FROM school_years
     WHERE active = FALSE
     ORDER BY date_from`
  );
  let total = 0;
  for (const year of years.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const count = await computeSchoolYearTeacherStats(client, year.school_id, year.id);
      await client.query("COMMIT");
      console.log(`stats for ${year.name}: ${count} teachers`);
      total += count;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return total;
}

async function reportDuplicates(): Promise<void> {
  const dupes = await pool.query<{ group_id: string; child_id: string; cnt: string }>(
    `SELECT group_id, child_id, COUNT(*)::text AS cnt
     FROM group_students
     WHERE school_year_id IS NOT NULL
     GROUP BY group_id, child_id, school_year_id
     HAVING COUNT(*) > 1`
  );
  if (dupes.rows.length > 0) {
    console.warn("Duplicate group_students (group, child, year):", dupes.rows);
  } else {
    console.log("No duplicate group_students per year.");
  }

  const missingYear = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM group_students WHERE school_year_id IS NULL`
  );
  console.log("group_students without school_year_id:", missingYear.rows[0]?.cnt ?? "0");
}

async function main() {
  console.log("Backfill school year history...");
  await backfillGroupStudentsSchoolYearId();
  const payments = await backfillPaymentsSchoolYearId();
  const billing = await backfillLessonBillingSchoolYearId();
  const statsTeachers = await backfillClosedYearStats();
  await reportDuplicates();
  console.log("Done.", { payments, billing, statsTeachers });
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
