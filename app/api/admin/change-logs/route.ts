import { NextRequest, NextResponse } from "next/server";
import { getUserById, queryDb } from "@/lib/db";
import {
  ADMIN_CHANGE_ENTITY_TYPES,
  type AdminChangeEntityType,
} from "@/lib/admin-change-log";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

type ChangeLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  summary: string;
  payload: unknown;
  created_at: string;
  actor_user_id: string | null;
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const entityTypeRaw = request.nextUrl.searchParams.get("entityType")?.trim() ?? "";
    const entityId = request.nextUrl.searchParams.get("entityId")?.trim() ?? "";
    if (
      !ADMIN_CHANGE_ENTITY_TYPES.includes(entityTypeRaw as AdminChangeEntityType) ||
      !entityId
    ) {
      return NextResponse.json(
        { message: "Wymagane: entityType (parent|child) oraz entityId" },
        { status: 400 },
      );
    }
    const entityType = entityTypeRaw as AdminChangeEntityType;

    if (entityType === "parent") {
      const parent = await getUserById(entityId);
      if (!parent || parent.role !== "PARENT") {
        return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });
      }
      if (actor.role === "MANAGER" && parent.school_id !== actor.school_id) {
        return NextResponse.json({ message: "Brak dostępu" }, { status: 403 });
      }
      if (parent.school_id && parent.school_id !== ctx.schoolId) {
        return NextResponse.json({ message: "Brak dostępu" }, { status: 403 });
      }
    } else {
      const child = await queryDb<{ id: string }>(
        `SELECT id FROM children WHERE id = $1 AND school_id = $2 LIMIT 1`,
        [entityId, ctx.schoolId],
      );
      if (!child.rows[0]) {
        return NextResponse.json({ message: "Nie znaleziono dziecka" }, { status: 404 });
      }
    }

    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
      : 50;

    const result = await queryDb<ChangeLogRow>(
      `SELECT
         l.id,
         l.entity_type,
         l.entity_id,
         l.action,
         l.summary,
         l.payload,
         l.created_at::text AS created_at,
         l.actor_user_id,
         u.first_name AS actor_first_name,
         u.last_name AS actor_last_name,
         u.email AS actor_email,
         u.role AS actor_role
       FROM admin_change_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE l.school_id = $1
         AND l.entity_type = $2
         AND l.entity_id = $3
       ORDER BY l.created_at DESC
       LIMIT $4`,
      [ctx.schoolId, entityType, entityId, limit],
    );

    return NextResponse.json({
      rows: result.rows.map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        summary: row.summary,
        payload: row.payload,
        createdAt: row.created_at,
        actor: row.actor_user_id
          ? {
              id: row.actor_user_id,
              firstName: row.actor_first_name,
              lastName: row.actor_last_name,
              email: row.actor_email,
              role: row.actor_role,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/change-logs:", error);
    return NextResponse.json({ message: "Błąd pobierania historii zmian" }, { status: 500 });
  }
}
