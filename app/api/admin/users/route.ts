import { NextRequest, NextResponse } from "next/server";
import { getAllUsers, getUsersByAccountType, getUserById, isAdmin } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createUser } from "@/lib/db";

// GET - pobierz użytkowników z filtrami
export async function GET(request: NextRequest) {
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

    // Pobierz parametry filtrowania
    const { searchParams } = new URL(request.url);
    const filterConfirmed = searchParams.get('confirmed');
    const filterAccountType = searchParams.get('accountType');

    let users;

    if (filterAccountType) {
      users = await getUsersByAccountType(filterAccountType as 'user' | 'admin' | 'lektor');
    } else {
      users = await getAllUsers();
    }

    // Filtruj po confirmed jeśli podano
    if (filterConfirmed !== null) {
      const confirmed = filterConfirmed === 'true';
      users = users.filter(u => u.confirmed === confirmed);
    }

    // Usuń password_hash z odpowiedzi
    const safeUsers = users.map(u => ({
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      account_type: u.account_type,
      confirmed: u.confirmed,
      active: u.active,
      resignation_date: u.resignation_date,
      created_at: u.created_at,
      last_login: u.last_login,
    }));

    return NextResponse.json({ users: safeUsers });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas pobierania użytkowników" },
      { status: 500 }
    );
  }
}

// POST - dodaj nowego użytkownika
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { email, password, firstName, lastName, accountType, confirmed } = body;

    // Walidacja
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { message: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    // Hashuj hasło
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Utwórz użytkownika
    const newUser = await createUser({
      email,
      passwordHash,
      firstName,
      lastName,
      accountType: accountType || 'user',
    });

    // Zaktualizuj confirmed jeśli podano
    if (confirmed !== undefined) {
      const { updateUser } = await import('@/lib/db');
      await updateUser(newUser.id, { confirmed });
    }

    // Usuń password_hash z odpowiedzi
    const safeUser = {
      id: newUser.id,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      email: newUser.email,
      account_type: newUser.account_type,
      confirmed: confirmed || false,
      created_at: newUser.created_at,
    };

    return NextResponse.json({ user: safeUser, message: "Użytkownik został utworzony" });
  } catch (error: any) {
    console.error("Create user error:", error);
    if (error.message?.includes('UNIQUE') || error.message?.includes('unique')) {
      return NextResponse.json(
        { message: "Użytkownik z tym adresem email już istnieje" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Wystąpił błąd podczas tworzenia użytkownika" },
      { status: 500 }
    );
  }
}
