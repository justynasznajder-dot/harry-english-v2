import { NextRequest, NextResponse } from "next/server";
import {
  getChildrenByParentId,
  getUserById,
  queryDb,
  syncParentIdentityFromEnrollments,
} from "@/lib/db";
import { getOriginalTokenFromRequest, getTokenFromRequest } from "@/lib/auth";
import { isComplimentaryForParent } from "@/lib/school-discounts";

async function resolveSchoolName(schoolId: string | null | undefined): Promise<string | null> {
  const id = String(schoolId ?? "").trim();
  if (!id) return null;
  try {
    const res = await queryDb<{ name: string }>(
      `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0]?.name?.trim() || null;
  } catch {
    return null;
  }
}

/** Dla rodzica: nazwa szkoły z aktywnego zgłoszenia (źródło prawdy przy zapisie). */
async function resolveParentSchoolName(
  userId: string,
  parentEmail: string,
  accountSchoolId: string | null | undefined
): Promise<string | null> {
  try {
    const enrollmentRes = await queryDb<{ name: string; school_id: string }>(
      `SELECT s.name, er.school_id AS school_id
       FROM enrollment_requests er
       JOIN schools s ON s.id = er.school_id
       WHERE (
           er.user_id = $1
           OR LOWER(BTRIM(er.parent_email::text)) = LOWER(BTRIM($2::text))
         )
         AND UPPER(BTRIM(COALESCE(er.status::text, ''))) NOT IN ('COMPLETED', 'REJECTED')
       ORDER BY er.created_at DESC
       LIMIT 1`,
      [userId, parentEmail]
    );
    const row = enrollmentRes.rows[0];
    if (row?.name?.trim()) {
      return row.name.trim();
    }
  } catch {
    /* fallback na konto */
  }
  return resolveSchoolName(accountSchoolId);
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json(
        { message: "Nieautoryzowany dostęp" },
        { status: 401 }
      );
    }

    // Sprawdź czy użytkownik istnieje
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { message: "Użytkownik nie istnieje" },
        { status: 401 }
      );
    }

    // Rodzic widzi swoje dzieci; admin/teacher bez listy dzieci.
    let children: any[] = [];
    let displayFirstName = user.first_name;
    let displayLastName = user.last_name;
    let displayPhone = user.phone;
    if (user.role === "PARENT") {
      const synced = await syncParentIdentityFromEnrollments(userId);
      if (synced) {
        displayFirstName = synced.firstName;
        displayLastName = synced.lastName;
        displayPhone = synced.phone;
      }
      const rows = await getChildrenByParentId(userId);
      children = rows.map((c) => ({
        childId: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        birthDate: c.birth_date,
        active: c.active,
        confirmed: c.confirmed,
        accessLevel: c.access_level,
        enrollmentRequestId: c.enrollment_request_id,
        resignationRequested: c.resignation_requested || false,
        resignationReason: c.resignation_reason || null,
        clientNumber: c.client_number,
      }));
    }

    const schoolName =
      user.role === "PARENT"
        ? await resolveParentSchoolName(user.id, user.email, user.school_id)
        : await resolveSchoolName(user.school_id);

    let complimentaryAccess = false;
    if (user.role === "PARENT" && user.school_id) {
      complimentaryAccess = await isComplimentaryForParent(user.school_id, {
        parentId: user.id,
        parentEmail: user.email,
      });
    }

    let impersonation:
      | {
          active: true;
          adminId: string;
          adminEmail: string;
          adminFirstName: string;
          adminLastName: string;
        }
      | { active: false } = { active: false };

    const originalPayload = await getOriginalTokenFromRequest(request);
    if (originalPayload?.userId) {
      const admin = await getUserById(originalPayload.userId);
      if (admin && admin.role === "ADMIN") {
        impersonation = {
          active: true,
          adminId: admin.id,
          adminEmail: admin.email,
          adminFirstName: admin.first_name,
          adminLastName: admin.last_name,
        };
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        phone: displayPhone,
        firstName: displayFirstName,
        lastName: displayLastName,
        role: user.role,
        accessLevel: user.access_level,
        mustChangePassword: user.must_change_password === true,
        schoolId: user.school_id,
        schoolName,
        complimentaryAccess,
        clientNumber: user.client_number,
        children,
        impersonation,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas pobierania danych" },
      { status: 500 }
    );
  }
}
