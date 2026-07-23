import { NextRequest, NextResponse } from "next/server";
import { getMessageTemplatesForRole } from "@/lib/message-templates";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({ templates: getMessageTemplatesForRole("MANAGER") });
}
