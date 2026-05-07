import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db";
import {
  accountTypeToUserRole,
  canAccessSchoolAdminApis,
  getUserById,
  updateUser,
  deleteUser,
  restoreUser,
  getAllUsers,
  isAdmin,
  parseUserRole,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

/** Manager może działać wyłącznie na użytkownikach swojej szkoły (nie na ADMIN / bez school_id). */
function managerSchoolScopeError(actor: User, target: User | null): NextResponse | null {
  if (actor.role !== "MANAGER") return null;
  if (!actor.school_id) {
    return NextResponse.json(
      { message: "Konto zarządcy nie ma przypisanej szkoły." },
      { status: 400 }
    );
  }
  if (!target) {
    return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
  }
  if (target.role === "ADMIN" || target.school_id == null) {
    return NextResponse.json({ message: "Brak uprawnień do tego użytkownika" }, { status: 403 });
  }
  if (target.school_id !== actor.school_id) {
    return NextResponse.json(
      { message: "Możesz zarządzać tylko użytkownikami ze swojej szkoły" },
      { status: 403 }
    );
  }
  return null;
}

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
    const payload = await getTokenFromRequest(_request);
    const actorId = payload?.userId;
    if (!actorId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const userCanStaff = await canAccessSchoolAdminApis(actorId);
    if (!userCanStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const actor = await getUserById(actorId);
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

    return NextResponse.json({
      user: {
        id: target.id,
        first_name: target.first_name,
        last_name: target.last_name,
        email: target.email,
        role: target.role,
        account_type: target.account_type,
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
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const userCanStaff = await canAccessSchoolAdminApis(userId);
    if (!userCanStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const actor = await getUserById(userId);
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
      const allUsers = await getAllUsers();
      const user = allUsers.find(u => u.id === targetUserId);
      if (!user) {
        return NextResponse.json({ message: "Nie można pobrać zaktualizowanych danych" }, { status: 404 });
      }
      const safeUser = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        account_type: user.account_type,
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
      if (pr === "ADMIN" && !(await isAdmin(userId))) {
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
    if (body.account_type !== undefined) {
      if (actor.role === "MANAGER") {
        const elevated = accountTypeToUserRole(body.account_type as "user" | "admin" | "lektor");
        if (elevated === "ADMIN" || elevated === "MANAGER") {
          return NextResponse.json(
            { message: "Zarządca nie może nadać roli ADMIN ani MANAGER" },
            { status: 403 }
          );
        }
      }
      updateData.account_type = body.account_type;
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
      account_type: user.account_type,
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
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const userCanStaff = await canAccessSchoolAdminApis(userId);
    if (!userCanStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const actor = await getUserById(userId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const { id } = await params;
    const targetUserId = id;

    // Nie pozwól usunąć samego siebie
    if (targetUserId === userId) {
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
    
    // Pobierz zaktualizowanego użytkownika
    const allUsers = await getAllUsers();
    const user = allUsers.find(u => u.id === targetUserId);

    return NextResponse.json({ 
      user: user ? {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        account_type: user.account_type,
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
