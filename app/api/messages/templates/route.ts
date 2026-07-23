import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { requireMessageActor } from "@/lib/messages";
import { getMessageTemplatesForRole } from "@/lib/message-templates";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  return NextResponse.json({ templates: getMessageTemplatesForRole(actor.user.role) });
}
