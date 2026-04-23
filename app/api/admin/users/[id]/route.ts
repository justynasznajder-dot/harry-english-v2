import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUser, deleteUser, restoreUser, getAllUsers, isAdmin } from "@/lib/db";

// PUT - aktualizuj użytkownika
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Sprawdź autoryzację admina
    const authToken = request.cookies.get('auth-token');
    if (!authToken) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    let userId: string;
    try {
      const tokenData = Buffer.from(authToken.value, 'base64').toString();
      userId = tokenData.split(':')[0];
    } catch (error) {
      return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    }

    const userIsAdmin = await isAdmin(userId);
    if (!userIsAdmin) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const { id } = await params;
    const targetUserId = id;
    const body = await request.json();

    // Sprawdź czy to operacja przywracania
    if (body.restore === true) {
      const restored = await restoreUser(targetUserId);
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
    if (body.account_type !== undefined) updateData.account_type = body.account_type;
    if (body.confirmed !== undefined) updateData.confirmed = body.confirmed;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "Brak danych do aktualizacji" }, { status: 400 });
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
      account_type: user.account_type,
      confirmed: user.confirmed,
      active: user.active,
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
    // Sprawdź autoryzację admina
    const authToken = request.cookies.get('auth-token');
    if (!authToken) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    let userId: string;
    try {
      const tokenData = Buffer.from(authToken.value, 'base64').toString();
      userId = tokenData.split(':')[0];
    } catch (error) {
      return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    }

    const userIsAdmin = await isAdmin(userId);
    if (!userIsAdmin) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
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

    console.log(`Attempting to mark user ${targetUserId} as former`);
    const deleted = await deleteUser(targetUserId);

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
