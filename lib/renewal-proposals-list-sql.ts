import { POLISH_DAY_FROM_ST_SQL } from "@/lib/db";

/** Lista propozycji dla jednego `renewal_id` (JOIN grupa, harmonogram, kto wysłał). */
export function renewalProposalsListQuery(): string {
  return `
SELECT
  rp.id,
  rp.proposed_at,
  rp.responded_at,
  UPPER(BTRIM(COALESCE(rp.status::text, ''))) AS status,
  rp.rejection_comment,
  g.id AS group_id,
  g.name AS group_name,
  COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
  COALESCE(
    STRING_AGG(
      DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
      ', '
    ),
    'Do ustalenia'
  ) AS schedule,
  TRIM(COALESCE(pu.first_name, '')) AS proposed_by_first_name,
  TRIM(COALESCE(pu.last_name, '')) AS proposed_by_last_name
FROM renewal_proposals rp
JOIN renewals r ON r.id = rp.renewal_id
JOIN groups g ON g.id = rp.group_id
LEFT JOIN locations gl ON gl.id = g.location_id
LEFT JOIN schedule_templates st ON st.group_id = g.id
LEFT JOIN locations sl ON sl.id = st.location_id
LEFT JOIN users pu ON pu.id = rp.proposed_by
WHERE rp.renewal_id = $1
GROUP BY rp.id, rp.proposed_at, rp.responded_at, rp.status, rp.rejection_comment, g.id, g.name, pu.first_name, pu.last_name
ORDER BY rp.proposed_at DESC
`;
}
