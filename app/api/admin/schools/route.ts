import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireSuperAdmin(request);
    if (!ctx.ok) return ctx.response;

    const result = await queryDb<{
      id: string;
      name: string;
      slug: string;
      city: string | null;
      active: boolean;
      renewals_open: boolean;
    }>(
      `SELECT id, name, slug, city, active, renewals_open
       FROM schools
       ORDER BY active DESC, name ASC`
    );

    return NextResponse.json({
      schools: result.rows.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        city: s.city,
        active: s.active,
        renewalsOpen: s.renewals_open,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/schools:", error);
    return NextResponse.json(
      { message: "Nie udało się pobrać listy szkół" },
      { status: 500 }
    );
  }
}
