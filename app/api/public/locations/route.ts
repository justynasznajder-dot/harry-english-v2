import { NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import { formatLocationOptionLabel } from "@/lib/location-display";

/** Publiczna lista lokalizacji dla formularza zgłoszeniowego (filtrowana po szkole z env `SCHOOL_ID`). */
export async function GET() {
  try {
    const schoolId = getRegistrationSchoolId();
    const r = await queryDb<{
      id: string;
      name: string;
      is_featured: boolean;
      is_new: boolean;
    }>(
      `SELECT id, name, is_featured, is_new
       FROM locations
       WHERE school_id = $1 AND active = TRUE
       ORDER BY sort_order ASC, is_featured DESC, name ASC`,
      [schoolId]
    );
    return NextResponse.json({
      locations: r.rows.map((loc) => ({
        id: loc.id,
        name: loc.name,
        is_featured: loc.is_featured,
        is_new: loc.is_new,
        label: formatLocationOptionLabel(loc),
      })),
    });
  } catch (e) {
    console.error("public/locations GET:", e);
    return NextResponse.json({ message: "Nie udało się pobrać lokalizacji" }, { status: 500 });
  }
}
