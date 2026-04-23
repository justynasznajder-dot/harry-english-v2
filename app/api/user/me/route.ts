import { NextRequest, NextResponse } from "next/server";
import { getUserById, getStudentsByUserId } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Sprawdź czy użytkownik jest zalogowany (token z cookie)
    const authToken = request.cookies.get('auth-token');
    if (!authToken) {
      return NextResponse.json(
        { message: "Nieautoryzowany dostęp" },
        { status: 401 }
      );
    }

    // Pobierz user_id z tokenu (format: base64(user_id:timestamp))
    let userId: string;
    try {
      const tokenData = Buffer.from(authToken.value, 'base64').toString();
      userId = tokenData.split(':')[0];
    } catch (error) {
      return NextResponse.json(
        { message: "Nieprawidłowy token" },
        { status: 401 }
      );
    }

    // Sprawdź czy użytkownik istnieje
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { message: "Użytkownik nie istnieje" },
        { status: 404 }
      );
    }

    // Pobierz listę dzieci użytkownika tylko dla user i lektor (admin nie ma dzieci)
    let students: any[] = [];
    if (user.account_type === 'user' || user.account_type === 'lektor') {
      const studentsData = await getStudentsByUserId(userId);
      students = studentsData.map(s => ({
        studentId: s.student_id,
        firstName: s.first_name,
        lastName: s.last_name,
        birthYear: s.birth_year,
        location: s.location,
        active: s.active,
        resignationRequested: s.resignation_requested || false,
        resignationReason: s.resignation_reason || null,
      }));
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        accountType: user.account_type,
        students: students,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas pobierania danych" },
      { status: 500 }
    );
  }
}
