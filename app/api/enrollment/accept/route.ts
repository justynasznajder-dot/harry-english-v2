import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import { sendContractEmail } from "@/lib/email";

function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] ?? null;
  } catch {
    return null;
  }
}

function fillTemplate(html: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    html
  );
}

export async function PUT(request: NextRequest) {
  const parentId = getUserIdFromRequest(request);
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  try {
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
      [parentId, SCHOOL_ID]
    );
    const parent = parentRes.rows[0];
    if (!parent) return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });

    const enrollmentRes = await queryDb<{
      id: string;
      proposed_group_id: string;
      child_first_name: string;
      child_last_name: string;
      notes: string | null;
    }>(
      `SELECT id, proposed_group_id, child_first_name, child_last_name, notes
       FROM enrollment_requests
       WHERE user_id = $1 AND school_id = $2 AND status = 'PROPOSED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      return NextResponse.json({ message: "Brak propozycji do akceptacji" }, { status: 400 });
    }

    const groupRes = await queryDb<{
      id: string;
      name: string;
      location_name: string;
      schedule: string;
    }>(
      `SELECT g.id,
              g.name,
              COALESCE(l.name, 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  CONCAT(st.day_of_week, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.id = $1
       GROUP BY g.id, g.name, l.name`,
      [enrollment.proposed_group_id]
    );
    const group = groupRes.rows[0];

    const templateRes = await queryDb<{ id: string; content_html: string }>(
      `SELECT id, content_html
       FROM contract_templates
       WHERE school_id = $1 AND active = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
      [SCHOOL_ID]
    );
    const template = templateRes.rows[0];
    if (!template) return NextResponse.json({ message: "Brak aktywnego szablonu umowy" }, { status: 400 });

    const contractHtml = fillTemplate(template.content_html, {
      parent_first_name: parent.first_name,
      parent_last_name: parent.last_name,
      child_first_name: enrollment.child_first_name,
      child_last_name: enrollment.child_last_name,
      group_name: group?.name ?? "Do ustalenia",
      location_name: group?.location_name ?? "Do ustalenia",
      schedule: group?.schedule ?? "Do ustalenia",
      price_monthly: enrollment.notes ?? "0",
      start_date: new Date().toISOString().slice(0, 10),
      signed_at: "",
    });

    const childRes = await queryDb<{ id: string }>(
      `SELECT id FROM children
       WHERE parent_id = $1 AND school_id = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const childId = childRes.rows[0]?.id ?? null;

    const contractId = randomUUID();
    await queryDb(`UPDATE users SET access_level = 'CONTRACT_SENT' WHERE id = $1`, [parentId]);
    await queryDb(
      `UPDATE enrollment_requests
       SET status = 'ACCEPTED', accepted_at = NOW()
       WHERE id = $1`,
      [enrollment.id]
    );
    await queryDb(
      `INSERT INTO contracts (
        id, school_id, child_id, parent_id, group_id, template_id, content_html, status, sent_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT', NOW(), NOW())`,
      [contractId, SCHOOL_ID, childId, parentId, enrollment.proposed_group_id, template.id, contractHtml]
    );

    await sendContractEmail(parent.email, `${parent.first_name} ${parent.last_name}`, contractHtml);
    return NextResponse.json({ message: "Propozycja zaakceptowana, umowa wysłana" });
  } catch (error) {
    console.error("Enrollment accept error:", error);
    return NextResponse.json({ message: "Nie udało się zaakceptować propozycji" }, { status: 500 });
  }
}
