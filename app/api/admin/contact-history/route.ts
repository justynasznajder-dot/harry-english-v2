import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const parentId = request.nextUrl.searchParams.get("parentId")?.trim() ?? "";
  const childId = request.nextUrl.searchParams.get("childId")?.trim() ?? "";

  if (!parentId && !childId) {
    return NextResponse.json({ message: "Podaj parentId lub childId" }, { status: 400 });
  }

  try {
    let resolvedParentId = parentId;
    let childInfo: {
      id: string;
      name: string;
      accessLevel: string;
      groupName: string | null;
    } | null = null;

    if (childId) {
      const childRes = await queryDb<{
        id: string;
        first_name: string;
        last_name: string;
        parent_id: string;
        access_level: string;
        group_name: string | null;
      }>(
        `SELECT
           c.id,
           c.first_name,
           c.last_name,
           c.parent_id,
           UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW'))) AS access_level,
           (
             SELECT g.name
             FROM group_students gs
             JOIN groups g ON g.id = gs.group_id
             JOIN school_years sy ON sy.id = g.school_year_id AND sy.active = TRUE
             WHERE gs.child_id = c.id AND gs.left_at IS NULL
             LIMIT 1
           ) AS group_name
         FROM children c
         WHERE c.id = $1 AND c.school_id = $2
         LIMIT 1`,
        [childId, ctx.schoolId]
      );
      const row = childRes.rows[0];
      if (!row) {
        return NextResponse.json({ message: "Nie znaleziono dziecka" }, { status: 404 });
      }
      resolvedParentId = row.parent_id;
      childInfo = {
        id: row.id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        accessLevel: row.access_level,
        groupName: row.group_name,
      };
    }

    const parentRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      access_level: string;
    }>(
      `SELECT id, first_name, last_name, email, access_level
       FROM users
       WHERE id = $1 AND school_id = $2 AND role = 'PARENT'
       LIMIT 1`,
      [resolvedParentId, ctx.schoolId]
    );
    const parent = parentRes.rows[0];
    if (!parent) {
      return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });
    }

    const [messagesRes, enrollmentsRes, billingRes, renewalsRes, childrenRes] = await Promise.all([
      queryDb<{
        id: string;
        subject: string | null;
        content: string;
        created_at: Date | string;
        sender_first: string;
        sender_last: string;
        sender_role: string;
      }>(
        `SELECT
           m.id,
           m.subject,
           m.content,
           m.created_at,
           s.first_name AS sender_first,
           s.last_name AS sender_last,
           s.role AS sender_role
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         WHERE m.parent_message_id IS NULL
           AND (m.sender_id = $1 OR m.recipient_id = $1)
           AND m.school_id = $2
         ORDER BY m.created_at DESC
         LIMIT 30`,
        [resolvedParentId, ctx.schoolId]
      ),
      queryDb<{
        id: string;
        child_name: string;
        status: string;
        created_at: Date | string;
        proposed_group: string | null;
      }>(
        `SELECT
           er.id,
           CONCAT(er.child_first_name, ' ', er.child_last_name) AS child_name,
           UPPER(BTRIM(COALESCE(er.status::text, ''))) AS status,
           er.created_at,
           g.name AS proposed_group
         FROM enrollment_requests er
         LEFT JOIN groups g ON g.id = er.proposed_group_id
         WHERE er.school_id = $2
           AND (
             er.user_id = $1
             OR LOWER(BTRIM(er.parent_email)) = LOWER($3)
           )
         ORDER BY er.created_at DESC
         LIMIT 20`,
        [resolvedParentId, ctx.schoolId, parent.email]
      ),
      queryDb<{
        child_name: string;
        period_month: Date | string;
        status: string;
        amount: string;
      }>(
        `SELECT
           CONCAT(ch.first_name, ' ', ch.last_name) AS child_name,
           lbp.period_month,
           lbp.status,
           lbp.amount::text AS amount
         FROM lesson_billing_periods lbp
         JOIN children ch ON ch.id = lbp.child_id
         WHERE lbp.parent_id = $1 AND lbp.school_id = $2
         ORDER BY lbp.period_month DESC
         LIMIT 12`,
        [resolvedParentId, ctx.schoolId]
      ),
      queryDb<{
        child_name: string;
        season: string;
        status: string;
        initiated_at: Date | string;
      }>(
        `SELECT
           CONCAT(c.first_name, ' ', c.last_name) AS child_name,
           r.season,
           UPPER(BTRIM(COALESCE(r.status::text, ''))) AS status,
           r.initiated_at
         FROM renewals r
         JOIN children c ON c.id = r.child_id
         WHERE r.parent_id = $1 AND r.school_id = $2
         ORDER BY r.initiated_at DESC
         LIMIT 10`,
        [resolvedParentId, ctx.schoolId]
      ),
      queryDb<{
        id: string;
        first_name: string;
        last_name: string;
        access_level: string;
        group_name: string | null;
        resignation_requested: boolean;
      }>(
        `SELECT
           c.id,
           c.first_name,
           c.last_name,
           UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW'))) AS access_level,
           (
             SELECT g.name
             FROM group_students gs
             JOIN groups g ON g.id = gs.group_id
             JOIN school_years sy ON sy.id = g.school_year_id AND sy.active = TRUE
             WHERE gs.child_id = c.id AND gs.left_at IS NULL
             LIMIT 1
           ) AS group_name,
           c.resignation_requested
         FROM children c
         WHERE c.parent_id = $1 AND c.school_id = $2 AND c.active = TRUE
         ORDER BY c.last_name, c.first_name`,
        [resolvedParentId, ctx.schoolId]
      ),
    ]);

    return NextResponse.json({
      parent: {
        id: parent.id,
        name: `${parent.first_name} ${parent.last_name}`.trim(),
        email: parent.email,
        accessLevel: parent.access_level,
      },
      child: childInfo,
      children: childrenRes.rows.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        accessLevel: c.access_level,
        groupName: c.group_name,
        resignationRequested: c.resignation_requested,
      })),
      messages: messagesRes.rows.map((m) => ({
        id: m.id,
        subject: m.subject,
        contentPreview: m.content.slice(0, 200),
        createdAt:
          m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
        senderName: `${m.sender_first} ${m.sender_last}`.trim(),
        senderRole: m.sender_role,
      })),
      enrollments: enrollmentsRes.rows.map((e) => ({
        id: e.id,
        childName: e.child_name,
        status: e.status,
        proposedGroup: e.proposed_group,
        createdAt:
          e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
      })),
      billing: billingRes.rows.map((b) => ({
        childName: b.child_name,
        periodMonth:
          b.period_month instanceof Date
            ? b.period_month.toISOString().slice(0, 7)
            : String(b.period_month).slice(0, 7),
        status: b.status,
        amount: b.amount,
      })),
      renewals: renewalsRes.rows.map((r) => ({
        childName: r.child_name,
        season: r.season,
        status: r.status,
        initiatedAt:
          r.initiated_at instanceof Date ? r.initiated_at.toISOString() : String(r.initiated_at),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/contact-history:", error);
    return NextResponse.json({ message: "Błąd historii kontaktu" }, { status: 500 });
  }
}
