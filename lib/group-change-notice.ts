/**
 * Checkbox „zmiana grupy” na aktywnym członkostwie (group_students).
 * Analogicznie do schedule_change_notice na groups — bez maila.
 */
import { randomUUID } from "crypto";
import { queryDb, runPgTransaction } from "@/lib/db";

export async function setChildGroupChangeNotice(
  childId: string,
  schoolId: string,
  enabled: boolean
): Promise<
  | {
      ok: true;
      membershipId: string;
      groupChangeNotice: boolean;
      groupBeforeLabel: string | null;
      groupId: string;
      groupName: string;
    }
  | { ok: false; status: number; message: string }
> {
  const existing = await queryDb<{
    id: string;
    group_id: string;
    group_name: string;
    group_change_notice: boolean;
    group_before_label: string | null;
  }>(
    `SELECT gs.id,
            gs.group_id,
            g.name AS group_name,
            COALESCE(gs.group_change_notice, FALSE) AS group_change_notice,
            gs.group_before_label
     FROM group_students gs
     INNER JOIN groups g ON g.id = gs.group_id AND g.school_id = $2
     WHERE gs.child_id = $1
       AND gs.left_at IS NULL
       AND (
         gs.school_year_id IS NULL
         OR EXISTS (
           SELECT 1 FROM school_years sy
           WHERE sy.id = gs.school_year_id
             AND sy.school_id = $2
             AND sy.active = TRUE
         )
       )
     ORDER BY gs.enrolled_at DESC NULLS LAST
     LIMIT 1`,
    [childId, schoolId]
  );

  const row = existing.rows[0];
  if (!row) {
    return {
      ok: false,
      status: 400,
      message: "Dziecko nie ma aktywnej grupy — najpierw przypisz je do grupy.",
    };
  }

  let beforeLabel = row.group_before_label?.trim() || null;
  if (enabled && !beforeLabel) {
    beforeLabel = row.group_name.trim();
    if (!beforeLabel) {
      return {
        ok: false,
        status: 400,
        message: "Brak nazwy aktualnej grupy — nie można zrobić snapshota.",
      };
    }
  }

  const updated = await queryDb<{
    id: string;
    group_id: string;
    group_change_notice: boolean;
    group_before_label: string | null;
  }>(
    `UPDATE group_students
     SET group_change_notice = $3,
         group_before_label = COALESCE(group_before_label, $4)
     WHERE id = $1
       AND school_id = $2
     RETURNING id, group_id, group_change_notice, group_before_label`,
    [row.id, schoolId, enabled, beforeLabel]
  );

  const u = updated.rows[0];
  if (!u) {
    return { ok: false, status: 404, message: "Nie znaleziono członkostwa" };
  }

  return {
    ok: true,
    membershipId: u.id,
    groupChangeNotice: Boolean(u.group_change_notice),
    groupBeforeLabel: u.group_before_label?.trim() || beforeLabel,
    groupId: u.group_id,
    groupName: row.group_name,
  };
}

/**
 * Przenosi dziecko do innej grupy: zamyka aktywne członkostwo (`left_at`)
 * i otwiera nowe (INSERT lub reopen zamkniętego wiersza docelowej grupy).
 * Wymaga włączonego group_change_notice.
 */
export async function transferChildGroupMembership(opts: {
  childId: string;
  schoolId: string;
  newGroupId: string;
}): Promise<
  | {
      ok: true;
      membershipId: string;
      groupId: string;
      groupName: string;
      previousGroupId: string;
      previousGroupName: string;
      groupChangeNotice: boolean;
      groupBeforeLabel: string | null;
    }
  | { ok: false; status: number; message: string }
> {
  const { childId, schoolId, newGroupId } = opts;

  const membership = await queryDb<{
    id: string;
    group_id: string;
    school_year_id: string | null;
    group_change_notice: boolean;
    group_before_label: string | null;
    group_name: string;
    lessons_per_week: number | null;
    lesson_unit_price: string | null;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
  }>(
    `SELECT gs.id,
            gs.group_id,
            gs.school_year_id,
            COALESCE(gs.group_change_notice, FALSE) AS group_change_notice,
            gs.group_before_label,
            g.name AS group_name,
            gs.lessons_per_week,
            gs.lesson_unit_price::text,
            gs.monthly_unit_price::text,
            gs.yearly_unit_price::text
     FROM group_students gs
     INNER JOIN groups g ON g.id = gs.group_id AND g.school_id = $2
     WHERE gs.child_id = $1
       AND gs.left_at IS NULL
       AND (
         gs.school_year_id IS NULL
         OR EXISTS (
           SELECT 1 FROM school_years sy
           WHERE sy.id = gs.school_year_id
             AND sy.school_id = $2
             AND sy.active = TRUE
         )
       )
     ORDER BY gs.enrolled_at DESC NULLS LAST
     LIMIT 1`,
    [childId, schoolId]
  );

  const row = membership.rows[0];
  if (!row) {
    return { ok: false, status: 400, message: "Dziecko nie ma aktywnej grupy" };
  }
  if (!row.group_change_notice) {
    return {
      ok: false,
      status: 403,
      message: 'Zaznacz „zmiana grupy”, aby przenieść ucznia do innej grupy.',
    };
  }
  if (row.group_id === newGroupId) {
    return {
      ok: false,
      status: 409,
      message: "Uczeń jest już w wybranej grupie",
    };
  }

  const target = await queryDb<{ id: string; name: string; active: boolean }>(
    `SELECT id, name, active
     FROM groups
     WHERE id = $1
       AND school_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [newGroupId, schoolId]
  );
  const targetGroup = target.rows[0];
  if (!targetGroup) {
    return { ok: false, status: 404, message: "Nie znaleziono grupy docelowej" };
  }
  if (!targetGroup.active) {
    return { ok: false, status: 400, message: "Grupa docelowa jest nieaktywna" };
  }

  const beforeLabel =
    row.group_before_label?.trim() || row.group_name.trim() || null;

  const conflict = await queryDb<{ id: string; left_at: string | null }>(
    `SELECT id, left_at::text AS left_at
     FROM group_students
     WHERE group_id = $1
       AND child_id = $2
       AND school_year_id IS NOT DISTINCT FROM $3::text
       AND id <> $4
     LIMIT 1`,
    [newGroupId, childId, row.school_year_id, row.id]
  );
  if (conflict.rows[0] && conflict.rows[0].left_at == null) {
    return {
      ok: false,
      status: 409,
      message: "Uczeń ma już aktywne członkostwo w tej grupie",
    };
  }

  try {
    const result = await runPgTransaction(async (client) => {
      const closed = await client.query<{ id: string }>(
        `UPDATE group_students
         SET left_at = CURRENT_DATE,
             group_before_label = COALESCE(group_before_label, $3)
         WHERE id = $1
           AND school_id = $2
           AND left_at IS NULL
         RETURNING id`,
        [row.id, schoolId, beforeLabel]
      );
      if (!closed.rows[0]) {
        throw new Error("CLOSE_FAILED");
      }

      if (conflict.rows[0]) {
        const reopened = await client.query<{
          id: string;
          group_change_notice: boolean;
          group_before_label: string | null;
        }>(
          `UPDATE group_students
           SET left_at = NULL,
               enrolled_at = CURRENT_DATE,
               school_id = $2,
               lesson_unit_price = $3,
               monthly_unit_price = $4,
               yearly_unit_price = $5,
               lessons_per_week = $6,
               group_change_notice = FALSE,
               group_before_label = COALESCE(group_before_label, $7)
           WHERE id = $1
           RETURNING id, group_change_notice, group_before_label`,
          [
            conflict.rows[0].id,
            schoolId,
            row.lesson_unit_price,
            row.monthly_unit_price,
            row.yearly_unit_price,
            row.lessons_per_week,
            beforeLabel,
          ]
        );
        const u = reopened.rows[0];
        if (!u) throw new Error("REOPEN_FAILED");
        return u;
      }

      const membershipId = randomUUID();
      const inserted = await client.query<{
        id: string;
        group_change_notice: boolean;
        group_before_label: string | null;
      }>(
        `INSERT INTO group_students (
           id, school_id, group_id, child_id, enrolled_at, school_year_id,
           lesson_unit_price, monthly_unit_price, yearly_unit_price, lessons_per_week,
           group_change_notice, group_before_label
         ) VALUES (
           $1, $2, $3, $4, CURRENT_DATE, $5,
           $6, $7, $8, $9,
           FALSE, $10
         )
         RETURNING id, group_change_notice, group_before_label`,
        [
          membershipId,
          schoolId,
          newGroupId,
          childId,
          row.school_year_id,
          row.lesson_unit_price,
          row.monthly_unit_price,
          row.yearly_unit_price,
          row.lessons_per_week,
          beforeLabel,
        ]
      );
      const u = inserted.rows[0];
      if (!u) throw new Error("INSERT_FAILED");
      return u;
    });

    return {
      ok: true,
      membershipId: result.id,
      groupId: newGroupId,
      groupName: targetGroup.name,
      previousGroupId: row.group_id,
      previousGroupName: row.group_name,
      groupChangeNotice: Boolean(result.group_change_notice),
      groupBeforeLabel: result.group_before_label?.trim() || beforeLabel,
    };
  } catch (error) {
    console.error("transferChildGroupMembership:", error);
    return { ok: false, status: 500, message: "Nie udało się przenieść ucznia" };
  }
}
