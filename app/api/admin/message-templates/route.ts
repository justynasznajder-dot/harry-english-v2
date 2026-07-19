import { NextRequest, NextResponse } from "next/server";
import { MESSAGE_TEMPLATES } from "@/lib/message-templates";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({ templates: MESSAGE_TEMPLATES });
}
