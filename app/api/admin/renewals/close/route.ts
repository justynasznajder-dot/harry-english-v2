import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    await queryDb(`UPDATE schools SET renewals_open = FALSE WHERE id = $1`, [schoolId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin renewals close error:", error);
    return NextResponse.json({ message: "Błąd zamykania zapisów" }, { status: 500 });
  }
}
