import { POLISH_DAY_FROM_ST_SQL } from "@/lib/db";

/** Lista propozycji dla jednego `enrollment_request_id` (JOIN grupa, harmonogram, kto wysłał). */
export function enrollmentProposalsListQuery(): string {
  return `
SELECT
  ep.id,
  ep.proposed_at,
  ep.responded_at,
  UPPER(BTRIM(COALESCE(ep.status::text, ''))) AS status,
  ep.rejection_comment,
  g.id AS group_id,
  g.name AS group_name,
  COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
  COALESCE(
    STRING_AGG(
      DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
      ', '
    ),
    'Do ustalenia'
  ) AS schedule,
  TRIM(COALESCE(pu.first_name, '')) AS proposed_by_first_name,
  TRIM(COALESCE(pu.last_name, '')) AS proposed_by_last_name
FROM enrollment_proposals ep
JOIN enrollment_requests er ON er.id = ep.enrollment_request_id
JOIN groups g ON g.id = ep.group_id
LEFT JOIN schedule_templates st ON st.group_id = g.id
LEFT JOIN locations l ON l.id = st.location_id
LEFT JOIN users pu ON pu.id = ep.proposed_by
WHERE ep.enrollment_request_id = $1
GROUP BY ep.id, ep.proposed_at, ep.responded_at, ep.status, ep.rejection_comment, g.id, g.name, pu.first_name, pu.last_name
ORDER BY ep.proposed_at DESC
`;
}
