import { NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";

/** Publiczna lista lokalizacji dla formularza zgłoszeniowego (filtrowana po szkole z env `SCHOOL_ID`). */
export async function GET() {
  try {
    const schoolId = getRegistrationSchoolId();
    const r = await queryDb<{ id: string; name: string }>(
      `SELECT id, name
       FROM locations
       WHERE school_id = $1 AND active = TRUE
       ORDER BY name ASC`,
      [schoolId]
    );
    return NextResponse.json({ locations: r.rows });
  } catch (e) {
    console.error("public/locations GET:", e);
    return NextResponse.json({ message: "Nie udało się pobrać lokalizacji" }, { status: 500 });
  }
}
