import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db";
import {
  getUserById,
  updateUser,
  deleteUser,
  restoreUser,
  isAdmin,
  parseUserRole,
  queryDb,
} from "@/lib/db";
import {
  managerSchoolScopeError,
  requireAdminSchoolContext,
} from "@/lib/admin-school-context";
import { syncParentUserAccessLevel } from "@/lib/enrollment-sync";

function managerForbiddenSchoolFields(actor: User, body: Record<string, unknown>): NextResponse | null {
  if (actor.role !== "MANAGER") return null;
  if (
    body.school_id !== undefined ||
    body.schoolId !== undefined ||
    body.school !== undefined
  ) {
    return NextResponse.json(
      { message: "Zarządca nie może zmieniać przypisania szkoły (school_id)" },
      { status: 403 }
    );
  }
  return null;
}

// GET — szczegóły użytkownika (panel admina)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminSchoolContext(_request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const { id: targetUserId } = await params;
    const target = await getUserById(targetUserId);
    const scopeErr = managerSchoolScopeError(actor, target);
    if (scopeErr) return scopeErr;

    if (!target) {
      return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
    }

    if (target.role === "PARENT") {
      await syncParentUserAccessLevel(target.id);
      const refreshed = await getUserById(targetUserId);
      const signed = await queryDb<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM contracts
           WHERE parent_id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'SIGNED'
         ) AS ok`,
        [targetUserId]
      );
      const u = refreshed ?? target;
      return NextResponse.json({
        user: {
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role,
          confirmed: u.confirmed,
          active: u.active,
          access_level: u.access_level,
          phone: u.phone,
          school_id: u.school_id,
          resignation_date: u.resignation_date,
          created_at: u.created_at,
          last_login: u.last_login,
          hasSignedContract: Boolean(signed.rows[0]?.ok),
        },
      });
    }

    return NextResponse.json({
      user: {
        id: target.id,
        first_name: target.first_name,
        last_name: target.last_name,
        email: target.email,
        role: target.role,
        confirmed: target.confirmed,
        active: target.active,
        access_level: target.access_level,
        phone: target.phone,
        school_id: target.school_id,
        resignation_date: target.resignation_date,
        created_at: target.created_at,
        last_login: target.last_login,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas pobierania użytkownika" },
      { status: 500 }
    );
  }
}

// PUT - aktualizuj użytkownika
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const { id } = await params;
    const targetUserId = id;
    const body = await request.json();

    const schoolFieldReject = managerForbiddenSchoolFields(actor, body as Record<string, unknown>);
    if (schoolFieldReject) return schoolFieldReject;

    // Sprawdź czy to operacja przywracania
    if (body.restore === true) {
      const targetUser = await getUserById(targetUserId);
      const scopeErr = managerSchoolScopeError(actor, targetUser);
      if (scopeErr) return scopeErr;

      let restoreScope: string | null | undefined;
      if (actor.role === "MANAGER") {
        restoreScope = actor.school_id;
      } else if (targetUser?.role === "ADMIN" && targetUser.school_id == null) {
        restoreScope = null;
      } else if (targetUser?.school_id != null) {
        restoreScope = targetUser.school_id;
      } else {
        restoreScope = undefined;
      }

      const restored = await restoreUser(targetUserId, restoreScope);
      if (!restored) {
        return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
      }
      const user = await getUserById(targetUserId);
      if (!user) {
        return NextResponse.json({ message: "Nie można pobrać zaktualizowanych danych" }, { status: 404 });
      }
      const safeUser = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        confirmed: user.confirmed,
        active: user.active,
        resignation_date: user.resignation_date,
        created_at: user.created_at,
        last_login: user.last_login,
      };
      return NextResponse.json({ user: safeUser, message: "Użytkownik został przywrócony" });
    }

    const updateData: any = {};
    if (body.first_name !== undefined) updateData.first_name = body.first_name;
    if (body.last_name !== undefined) updateData.last_name = body.last_name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.role !== undefined) {
      const pr = parseUserRole(String(body.role));
      if (!pr) {
        return NextResponse.json({ message: "Nieprawidłowa rola" }, { status: 400 });
      }
      if (pr === "ADMIN" && !(await isAdmin(ctx.userId))) {
        return NextResponse.json(
          { message: "Tylko super administrator (ADMIN) może nadać rolę ADMIN" },
          { status: 403 }
        );
      }
      if (actor.role === "MANAGER" && (pr === "ADMIN" || pr === "MANAGER")) {
        return NextResponse.json(
          { message: "Zarządca nie może nadać roli ADMIN ani MANAGER" },
          { status: 403 }
        );
      }
      updateData.role = pr;
    }
    if (body.confirmed !== undefined) updateData.confirmed = body.confirmed;
    if (body.phone !== undefined) {
      const p = body.phone;
      updateData.phone =
        p == null || String(p).trim() === "" ? null : String(p).trim();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "Brak danych do aktualizacji" }, { status: 400 });
    }

    const targetForUpdate = await getUserById(targetUserId);
    const updateScopeErr = managerSchoolScopeError(actor, targetForUpdate);
    if (updateScopeErr) return updateScopeErr;

    if (targetForUpdate?.role === "PARENT") {
      const signed = await queryDb<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM contracts
           WHERE parent_id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'SIGNED'
         ) AS ok`,
        [targetUserId]
      );
      if (signed.rows[0]?.ok) {
        updateData.confirmed = true;
      }
    }

    const updated = await updateUser(targetUserId, updateData);

    if (!updated) {
      return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
    }

    // Pobierz zaktualizowanego użytkownika
    const user = await getUserById(targetUserId);
    if (!user) {
      return NextResponse.json({ message: "Nie można pobrać zaktualizowanych danych" }, { status: 404 });
    }

    const safeUser = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      confirmed: user.confirmed,
      active: user.active,
      phone: user.phone,
      access_level: user.access_level,
      resignation_date: user.resignation_date,
      created_at: user.created_at,
      last_login: user.last_login,
    };

    return NextResponse.json({ user: safeUser, message: "Użytkownik został zaktualizowany" });
  } catch (error: any) {
    console.error("Update user error:", error);
    if (error.message?.includes('UNIQUE') || error.message?.includes('unique')) {
      return NextResponse.json(
        { message: "Użytkownik z tym adresem email już istnieje" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Wystąpił błąd podczas aktualizacji użytkownika" },
      { status: 500 }
    );
  }
}

// DELETE - usuń użytkownika
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const { id } = await params;
    const targetUserId = id;

    // Nie pozwól usunąć samego siebie
    if (targetUserId === ctx.userId) {
      return NextResponse.json(
        { message: "Nie można usunąć własnego konta" },
        { status: 400 }
      );
    }

    const targetUser = await getUserById(targetUserId);
    const deleteScopeErr = managerSchoolScopeError(actor, targetUser);
    if (deleteScopeErr) return deleteScopeErr;

    let deleteScope: string | null | undefined;
    if (actor.role === "MANAGER") {
      deleteScope = actor.school_id;
    } else if (targetUser?.role === "ADMIN" && targetUser.school_id == null) {
      deleteScope = null;
    } else if (targetUser?.school_id != null) {
      deleteScope = targetUser.school_id;
    } else {
      deleteScope = undefined;
    }

    console.log(`Attempting to mark user ${targetUserId} as former`);
    const deleted = await deleteUser(targetUserId, deleteScope);

    if (!deleted) {
      console.log(`User ${targetUserId} not found`);
      return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
    }

    console.log(`User ${targetUserId} successfully marked as former`);

    const user = await getUserById(targetUserId);

    return NextResponse.json({ 
      user: user ? {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        confirmed: user.confirmed,
        active: user.active,
        resignation_date: user.resignation_date,
        created_at: user.created_at,
        last_login: user.last_login,
      } : null,
      message: "Użytkownik został oznaczony jako nieaktywny" 
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas usuwania użytkownika" },
      { status: 500 }
    );
  }
}
