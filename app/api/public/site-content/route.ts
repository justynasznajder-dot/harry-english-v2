import { NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";

/**
 * Publiczne dane strony głównej — aktywni nauczyciele szkoły (SCHOOL_ID).
 * Galeria, FAQ i opinie są statyczne w `app/page.tsx` / `src/data/homeFallbackContent.ts`.
 */
export async function GET() {
  try {
    const schoolId = getRegistrationSchoolId();
    if (!schoolId) {
      return NextResponse.json({ teachers: [] });
    }

    const teachersRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, first_name, last_name
       FROM users
       WHERE school_id = $1 AND role = 'TEACHER' AND active = TRUE
       ORDER BY last_name ASC, first_name ASC`,
      [schoolId]
    );

    return NextResponse.json({ teachers: teachersRes.rows });
  } catch (e) {
    console.error("public/site-content GET:", e);
    return NextResponse.json({ message: "Nie udało się pobrać treści" }, { status: 500 });
  }
}
