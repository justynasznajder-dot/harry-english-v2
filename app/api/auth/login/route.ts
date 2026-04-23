import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, updateLastLogin, getStudentsByUserId } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Walidacja
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email i hasło są wymagane" },
        { status: 400 }
      );
    }

    // Znajdź użytkownika w bazie danych
    const user = await getUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        { message: "Nieprawidłowy email lub hasło" },
        { status: 401 }
      );
    }

    // Sprawdź hasło
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { message: "Nieprawidłowy email lub hasło" },
        { status: 401 }
      );
    }

    // Zaktualizuj ostatnie logowanie
    await updateLastLogin(user.id);

    // Pobierz listę dzieci użytkownika tylko dla user i lektor (admin nie ma dzieci)
    let students: any[] = [];
    if (user.account_type === 'user' || user.account_type === 'lektor') {
      const studentsData = await getStudentsByUserId(user.id);
      students = studentsData.map(s => ({
        studentId: s.student_id,
        firstName: s.first_name,
        lastName: s.last_name,
        birthYear: s.birth_year,
        location: s.location,
        active: s.active,
      }));
    }

    // Zwróć token (w wersji produkcyjnej użyj JWT)
    const token = Buffer.from(`${user.id}:${Date.now()}`).toString("base64");

    const response = NextResponse.json({
      message: "Zalogowano pomyślnie",
      token,
      userName: `${user.first_name} ${user.last_name}`,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        accountType: user.account_type,
        students: students,
      },
    });

    // Ustaw cookie z tokenem
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 dni
      path: '/',
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas logowania" },
      { status: 500 }
    );
  }
}
