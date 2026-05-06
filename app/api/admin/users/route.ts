import { NextRequest, NextResponse } from "next/server";
import {
  accountTypeToUserRole,
  canAccessSchoolAdminApis,
  getAllUsers,
  getRegistrationSchoolId,
  getUserById,
  getUsersByRole,
  isAdmin,
  parseUserRole,
  UserRole,
} from "@/lib/db";
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

    const userCanStaff = await canAccessSchoolAdminApis(userId);
    if (!userCanStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    // Pobierz parametry filtrowania
    const { searchParams } = new URL(request.url);
    const filterConfirmed = searchParams.get('confirmed');
    const filterRole = searchParams.get("role") ?? searchParams.get("accountType");

    let users;

    if (filterRole) {
      const upper = filterRole.toUpperCase();
      const parsed = parseUserRole(upper);
      const role = (parsed ??
        accountTypeToUserRole(filterRole as "user" | "admin" | "lektor")) as UserRole;
      users = await getUsersByRole(role);
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
      role: u.role,
      account_type: u.account_type,
      confirmed: u.confirmed,
      active: u.active,
      access_level: u.access_level,
      phone: u.phone,
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

    const userCanStaff = await canAccessSchoolAdminApis(userId);
    if (!userCanStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const actor = await getUserById(userId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const body = await request.json();
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      accountType,
      confirmed,
      accessLevel,
      phone: phoneRaw,
    } = body;
    const phone =
      phoneRaw != null && String(phoneRaw).trim() !== "" ? String(phoneRaw).trim() : null;

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

    let targetRole: UserRole = "PARENT";
    if (role != null && String(role).trim() !== "") {
      const p = parseUserRole(String(role));
      if (!p) {
        return NextResponse.json({ message: "Nieprawidłowa rola" }, { status: 400 });
      }
      targetRole = p;
    } else if (accountType) {
      targetRole = accountTypeToUserRole(accountType);
    }

    if (targetRole === "ADMIN" && !(await isAdmin(userId))) {
      return NextResponse.json(
        { message: "Tylko super administrator (ADMIN) może tworzyć konta z rolą ADMIN" },
        { status: 403 }
      );
    }

    if (actor.role === "MANAGER" && targetRole === "ADMIN") {
      return NextResponse.json(
        { message: "Zarządca szkoły nie może tworzyć kont super administratora" },
        { status: 403 }
      );
    }

    let targetSchoolId: string | null;
    if (targetRole === "ADMIN") {
      targetSchoolId = null;
    } else if (actor.role === "MANAGER") {
      if (!actor.school_id) {
        return NextResponse.json(
          { message: "Konto zarządcy nie ma przypisanej szkoły — skontaktuj się z administratorem." },
          { status: 400 }
        );
      }
      targetSchoolId = actor.school_id;
    } else if (actor.role === "ADMIN") {
      const fromBody =
        body.schoolId ??
        body.school_id ??
        (typeof body.school === "object" && body.school?.id ? body.school.id : undefined);
      const parsed =
        fromBody != null && String(fromBody).trim() !== "" ? String(fromBody).trim() : null;
      targetSchoolId = parsed ?? getRegistrationSchoolId();
    } else {
      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
    }

    const resolvedConfirmed =
      confirmed !== undefined ? Boolean(confirmed) : targetRole === "PARENT" ? false : true;

    // Utwórz użytkownika — school_id wyłącznie z sesji (MANAGER) / reguł powyżej, nigdy „ufamy” samemu body przy managerze
    const newUser = await createUser({
      email,
      passwordHash,
      firstName,
      lastName,
      role: targetRole,
      schoolId: targetSchoolId,
      phone,
      confirmed: resolvedConfirmed,
      accessLevel: accessLevel || (targetRole === "PARENT" ? "PENDING" : "ACTIVE"),
    });

    // Usuń password_hash z odpowiedzi
    const safeUser = {
      id: newUser.id,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      email: newUser.email,
      role: newUser.role,
      account_type: newUser.account_type,
      confirmed: newUser.confirmed,
      active: newUser.active,
      access_level: newUser.access_level,
      phone: newUser.phone,
      created_at: newUser.created_at,
    };

    return NextResponse.json({ user: safeUser, message: "Użytkownik został utworzony" });
  } catch (error: unknown) {
    console.error("Create user error:", error);
    const pg = error as { code?: string; message?: string; detail?: string };
    if (
      pg.code === "23505" ||
      /duplicate key|unique constraint/i.test(String(pg.message ?? ""))
    ) {
      return NextResponse.json(
        { message: "Użytkownik z tym adresem email już istnieje w tej szkole" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message.includes("Brak identyfikatora szkoły")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        message: "Wystąpił błąd podczas tworzenia użytkownika",
        pgCode: pg.code,
        pgMessage: pg.message,
        detail: pg.detail,
      },
      { status: 500 }
    );
  }
}
