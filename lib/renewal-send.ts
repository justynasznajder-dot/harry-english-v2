import { queryDb, runPgTransaction } from "@/lib/db";
import { formatRenewalStatusLabel } from "@/lib/renewal-status";
import { requireRenewalTargetSchoolYear } from "@/lib/school-year-planning";

export type RenewalSendCandidate = {
  childId: string;
  firstName: string;
  lastName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  groupId: string | null;
  groupName: string | null;
  renewalId: string | null;
  renewalStatus: string | null;
  renewalStatusLabel: string | null;
  alreadySent: boolean;
  sentAt: string | null;
  canSend: boolean;
  blockReason: string | null;
};

export type RenewalSendSummary = {
  total: number;
  canSend: number;
  alreadySent: number;
  resigned: number;
};

export type RenewalSendGroup = {
  id: string;
  name: string;
  locationName: string;
  schedule: string;
  studentCount: number;
  canSendCount: number;
  alreadySentCount: number;
};

const SENDABLE_FROM = new Set(["DRAFT"]);
const BLOCK_STATUSES = new Set([
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PROPOSED",
  "NEGOTIATING",
  "ACCEPTED",
  "SIGNED",
]);

export async function fetchRenewalSendCandidates(
  schoolId: string
): Promise<
  | {
      ok: true;
      season: string;
      groups: RenewalSendGroup[];
      students: RenewalSendCandidate[];
      summary: RenewalSendSummary;
    }
  | { ok: false; message: string }
> {
  const target = await requireRenewalTargetSchoolYear(schoolId);
  if (!target.ok) return target;

  const season = target.year.name;

  const studentsRes = await queryDb<{
    child_id: string;
    first_name: string;
    last_name: string;
    parent_id: string;
    parent_first: string;
    parent_last: string;
    parent_email: string;
    group_id: string | null;
    group_name: string | null;
    renewal_id: string | null;
    renewal_status: string | null;
    renewal_initiated_at: Date | string | null;
  }>(
    `SELECT
       c.id AS child_id,
       c.first_name,
       c.last_name,
       c.parent_id,
       u.first_name AS parent_first,
       u.last_name AS parent_last,
       u.email AS parent_email,
       g.id AS group_id,
       g.name AS group_name,
       r.id AS renewal_id,
       UPPER(BTRIM(COALESCE(r.status::text, ''))) AS renewal_status,
       r.initiated_at AS renewal_initiated_at
     FROM children c
     JOIN users u ON u.id = c.parent_id
     JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
     JOIN groups g ON g.id = gs.group_id AND g.school_id = $1 AND g.active = TRUE
     JOIN school_years sy ON sy.id = gs.school_year_id AND sy.school_id = $1 AND sy.active = TRUE
     LEFT JOIN renewals r ON r.child_id = c.id AND r.season = $2 AND r.school_id = $1
     WHERE c.school_id = $1
       AND c.active = TRUE
       AND UPPER(BTRIM(COALESCE(c.access_level::text, ''))) = 'SIGNED'
     ORDER BY g.name, c.last_name, c.first_name`,
    [schoolId, season]
  );

  const students: RenewalSendCandidate[] = studentsRes.rows.map((row) => {
    const status = row.renewal_status?.trim().toUpperCase() || null;
    const alreadySent = Boolean(status && BLOCK_STATUSES.has(status));
    const sentAt =
      alreadySent && row.renewal_initiated_at
        ? row.renewal_initiated_at instanceof Date
          ? row.renewal_initiated_at.toISOString()
          : String(row.renewal_initiated_at)
        : null;
    let canSend = true;
    let blockReason: string | null = null;

    if (status === "RESIGNED") {
      canSend = false;
      blockReason = "Rezygnacja z odnowienia";
    } else if (alreadySent) {
      canSend = false;
      blockReason = "Zapytanie już wysłane — ponowna wysyłka zablokowana";
    } else if (status && !SENDABLE_FROM.has(status)) {
      canSend = false;
      blockReason = "Nie można wysłać ponownie";
    }

    return {
      childId: row.child_id,
      firstName: row.first_name,
      lastName: row.last_name,
      parentId: row.parent_id,
      parentName: `${row.parent_first} ${row.parent_last}`.trim(),
      parentEmail: row.parent_email,
      groupId: row.group_id,
      groupName: row.group_name,
      renewalId: row.renewal_id,
      renewalStatus: status,
      renewalStatusLabel: status ? formatRenewalStatusLabel(status) : null,
      alreadySent,
      sentAt,
      canSend,
      blockReason,
    };
  });

  const summary: RenewalSendSummary = {
    total: students.length,
    canSend: students.filter((s) => s.canSend).length,
    alreadySent: students.filter((s) => s.alreadySent).length,
    resigned: students.filter((s) => s.renewalStatus === "RESIGNED").length,
  };

  const groupMap = new Map<string, RenewalSendGroup>();
  for (const s of students) {
    if (!s.groupId || !s.groupName) continue;
    const existing = groupMap.get(s.groupId);
    if (existing) {
      existing.studentCount += 1;
      if (s.canSend) existing.canSendCount += 1;
      if (s.alreadySent) existing.alreadySentCount += 1;
    } else {
      groupMap.set(s.groupId, {
        id: s.groupId,
        name: s.groupName,
        locationName: "—",
        schedule: "—",
        studentCount: 1,
        canSendCount: s.canSend ? 1 : 0,
        alreadySentCount: s.alreadySent ? 1 : 0,
      });
    }
  }

  const groupIds = [...groupMap.keys()];
  if (groupIds.length > 0) {
    const meta = await queryDb<{
      id: string;
      location_name: string;
      schedule: string;
    }>(
      `SELECT g.id,
              COALESCE(MAX(l.name), '—') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CASE st.day_of_week
                    WHEN 1 THEN 'Poniedziałek'
                    WHEN 2 THEN 'Wtorek'
                    WHEN 3 THEN 'Środa'
                    WHEN 4 THEN 'Czwartek'
                    WHEN 5 THEN 'Piątek'
                    WHEN 6 THEN 'Sobota'
                    WHEN 7 THEN 'Niedziela'
                    ELSE CONCAT('Dzień ', st.day_of_week)
                  END || ' ' || TO_CHAR(st.start_time, 'HH24:MI'),
                  ', '
                ),
                '—'
              ) AS schedule
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.id = ANY($1::text[])
       GROUP BY g.id`,
      [groupIds]
    );
    for (const row of meta.rows) {
      const g = groupMap.get(row.id);
      if (g) {
        g.locationName = row.location_name;
        g.schedule = row.schedule;
      }
    }
  }

  return {
    ok: true,
    season,
    groups: [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pl")),
    students,
    summary,
  };
}

export async function sendRenewalInquiries(
  schoolId: string,
  opts: {
    groupIds: string[] | null;
    excludedChildIds: string[];
  }
): Promise<
  | { ok: true; sent: number; skipped: number; errors: string[] }
  | { ok: false; message: string }
> {
  const target = await requireRenewalTargetSchoolYear(schoolId);
  if (!target.ok) return target;

  const candidates = await fetchRenewalSendCandidates(schoolId);
  if (!candidates.ok) return candidates;

  const excluded = new Set(opts.excludedChildIds.map((id) => id.trim()).filter(Boolean));
  const groupFilter =
    opts.groupIds && opts.groupIds.length > 0 ? new Set(opts.groupIds) : null;

  const toSend = candidates.students.filter((s) => {
    if (excluded.has(s.childId)) return false;
    if (groupFilter && (!s.groupId || !groupFilter.has(s.groupId))) return false;
    return s.canSend;
  });

  if (toSend.length === 0) {
    return { ok: false, message: "Brak uczniów do wysłania zapytania" };
  }

  const season = target.year.name;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  await runPgTransaction(async (client) => {
    for (const student of toSend) {
      try {
        if (student.renewalId && student.renewalStatus === "DRAFT") {
          const upd = await client.query(
            `UPDATE renewals
             SET status = 'PENDING_CONFIRMATION', initiated_at = NOW()
             WHERE id = $1 AND school_id = $2 AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'DRAFT'`,
            [student.renewalId, schoolId]
          );
          if ((upd.rowCount ?? 0) > 0) {
            sent += 1;
          } else {
            skipped += 1;
          }
          continue;
        }

        const ins = await client.query<{ id: string }>(
          `INSERT INTO renewals (
             id, school_id, child_id, parent_id, season, status, initiated_at, created_at
           ) VALUES (
             gen_random_uuid()::text, $1, $2, $3, $4, 'PENDING_CONFIRMATION', NOW(), NOW()
           )
           ON CONFLICT (child_id, season) DO NOTHING
           RETURNING id`,
          [schoolId, student.childId, student.parentId, season]
        );

        if (ins.rows[0]) {
          sent += 1;
        } else {
          const activate = await client.query(
            `UPDATE renewals
             SET status = 'PENDING_CONFIRMATION', initiated_at = NOW()
             WHERE child_id = $1 AND season = $2 AND school_id = $3
               AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'DRAFT'`,
            [student.childId, season, schoolId]
          );
          if ((activate.rowCount ?? 0) > 0) {
            sent += 1;
          } else {
            skipped += 1;
          }
        }
      } catch (e) {
        errors.push(
          `${student.firstName} ${student.lastName}: ${e instanceof Error ? e.message : "błąd"}`
        );
        skipped += 1;
      }
    }
  });

  await queryDb(`UPDATE schools SET renewals_season = $2 WHERE id = $1`, [schoolId, season]);

  return { ok: true, sent, skipped, errors };
}
