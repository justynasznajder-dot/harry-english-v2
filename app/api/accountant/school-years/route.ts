import { NextRequest, NextResponse } from "next/server";
import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import { queryDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const r = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      date_from: string;
      date_to: string;
      active: boolean;
      created_at: Date;
    }>(
      `SELECT id, school_id, name, date_from::text, date_to::text, active, created_at
       FROM school_years
       WHERE school_id = $1
       ORDER BY date_from DESC`,
      [ctx.schoolId]
    );
    const years = r.rows.map((row) => ({
      ...row,
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
      isActive: row.active,
    }));
    return NextResponse.json({ years });
  } catch (error) {
    console.error("GET /api/accountant/school-years:", error);
    return NextResponse.json({ message: "Błąd pobierania lat szkolnych" }, { status: 500 });
  }
}
