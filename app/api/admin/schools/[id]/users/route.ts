import { NextRequest, NextResponse } from "next/server";
import { getAllUsers, queryDb } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Rodzic na liście impersonacji tylko gdy dostał dane do logowania:
 * - wysłany mail z propozycją (enrollment ≠ NEW), albo
 * - konto założone ręcznie w panelu (confirmed), albo
 * - już się logował.
 * Lektorzy / zarządcy / itd. — bez tego filtra.
 */
async function parentIdsWithPortalCredentials(
  schoolId: string,
  parentIds: string[]
): Promise<Set<string>> {
  if (parentIds.length === 0) return new Set();

  const res = await queryDb<{ parent_id: string }>(
    `SELECT DISTINCT u.id AS parent_id
     FROM users u
     WHERE u.school_id = $1
       AND u.id = ANY($2::text[])
       AND u.role = 'PARENT'
       AND (
         u.confirmed = TRUE
         OR u.last_login IS NOT NULL
         OR EXISTS (
           SELECT 1
           FROM enrollment_requests er
           WHERE er.school_id = u.school_id
             AND (
               er.user_id = u.id
               OR LOWER(BTRIM(er.parent_email::text)) = LOWER(u.email)
             )
             AND UPPER(BTRIM(COALESCE(er.status::text, ''))) <> 'NEW'
         )
       )`,
    [schoolId, parentIds]
  );

  return new Set(res.rows.map((r) => r.parent_id));
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireSuperAdmin(request);
    if (!ctx.ok) return ctx.response;

    const { id: schoolId } = await context.params;
    if (!schoolId?.trim()) {
      return NextResponse.json({ message: "Brak ID szkoły" }, { status: 400 });
    }

    const school = await queryDb<{ id: string; name: string }>(
      `SELECT id, name FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    if (!school.rows[0]) {
      return NextResponse.json({ message: "Szkoła nie istnieje" }, { status: 404 });
    }

    const users = await getAllUsers(schoolId);
    const withoutAdmins = users.filter((u) => u.role !== "ADMIN");

    const allParentIds = withoutAdmins
      .filter((u) => u.role === "PARENT")
      .map((u) => u.id);
    const parentsWithCredentials = await parentIdsWithPortalCredentials(
      schoolId,
      allParentIds
    );

    const visible = withoutAdmins.filter(
      (u) => u.role !== "PARENT" || parentsWithCredentials.has(u.id)
    );

    const parentIds = visible.filter((u) => u.role === "PARENT").map((u) => u.id);
    const childrenCountByParent = new Map<string, number>();
    if (parentIds.length > 0) {
      const counts = await queryDb<{ parent_id: string; cnt: number }>(
        `SELECT parent_id, COUNT(*)::int AS cnt
         FROM children
         WHERE school_id = $1
           AND parent_id = ANY($2::text[])
           AND active = TRUE
         GROUP BY parent_id`,
        [schoolId, parentIds]
      );
      for (const row of counts.rows) {
        childrenCountByParent.set(row.parent_id, row.cnt);
      }
    }

    return NextResponse.json({
      school: {
        id: school.rows[0].id,
        name: school.rows[0].name,
      },
      users: visible.map((u) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        role: u.role,
        confirmed: u.confirmed,
        active: u.active,
        access_level: u.access_level,
        phone: u.phone,
        school_id: u.school_id,
        client_number: u.client_number,
        resignation_date: u.resignation_date,
        created_at: u.created_at,
        last_login: u.last_login,
        children_count:
          u.role === "PARENT" ? (childrenCountByParent.get(u.id) ?? 0) : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/schools/[id]/users:", error);
    return NextResponse.json(
      { message: "Nie udało się pobrać użytkowników szkoły" },
      { status: 500 }
    );
  }
}
