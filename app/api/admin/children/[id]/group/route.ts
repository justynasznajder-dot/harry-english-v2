import { NextRequest, NextResponse } from "next/server";
import { writeAdminChangeLog } from "@/lib/admin-change-log";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { transferChildGroupMembership } from "@/lib/group-change-notice";

/**
 * Przeniesienie ucznia do innej grupy z profilu dziecka.
 * Wymaga zaznaczonego „zmiana grupy”.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: childId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as { groupId?: unknown };
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    if (!groupId) {
      return NextResponse.json({ message: "Podaj groupId" }, { status: 400 });
    }

    const result = await transferChildGroupMembership({
      childId,
      schoolId: ctx.schoolId,
      newGroupId: groupId,
    });
    if (!result.ok) {
      if (result.status === 404) return tenantNotFoundResponse(result.message);
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    await writeAdminChangeLog({
      schoolId: ctx.schoolId,
      actorUserId: ctx.userId,
      entityType: "child",
      entityId: childId,
      action: "GROUP_TRANSFER",
      summary: `Zmiana grupy: ${result.previousGroupName} → ${result.groupName}`,
      payload: {
        fields: ["group"],
        before: {
          group: result.previousGroupName,
          group_id: result.previousGroupId,
        },
        after: {
          group: result.groupName,
          group_id: result.groupId,
        },
      },
    });

    return NextResponse.json({
      message: `Uczeń przeniesiony do grupy „${result.groupName}”.`,
      membership: {
        id: result.membershipId,
        group_id: result.groupId,
        group_name: result.groupName,
        group_change_notice: result.groupChangeNotice,
        group_before_label: result.groupBeforeLabel,
      },
    });
  } catch (error) {
    console.error("PATCH children group transfer error:", error);
    return NextResponse.json({ message: "Błąd przenoszenia ucznia" }, { status: 500 });
  }
}
