import { NextRequest, NextResponse } from "next/server";
import { createStudent, getStudentsByUserId, Location } from "@/lib/db";
import { getUserById } from "@/lib/db";

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      firstName,
      lastName,
      birthYear,
      location,
    } = body;

    // Walidacja
    if (!firstName?.trim() || !lastName?.trim() || !birthYear || !location) {
      return NextResponse.json(
        { message: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    const birthYearNum = parseInt(birthYear);
    if (!birthYearNum || birthYearNum < 2000 || birthYearNum > currentYear) {
      return NextResponse.json(
        { message: `Nieprawidłowy rok urodzenia. Musi być między 2000 a ${currentYear}` },
        { status: 400 }
      );
    }

    const validLocations: Location[] = ['Paniówki', 'Halemba', 'Orzegów', 'Kochłowice', 'Bielszowice'];
    if (!validLocations.includes(location)) {
      return NextResponse.json(
        { message: `Nieprawidłowa lokalizacja: ${location}` },
        { status: 400 }
      );
    }

    // Utwórz nowego ucznia
    const newStudent = await createStudent({
      userId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthYear,
      location,
    });

    // Pobierz wszystkich uczniów użytkownika
    const allStudents = await getStudentsByUserId(userId);

    return NextResponse.json({
      message: "Uczeń został dodany pomyślnie",
      student: {
        studentId: newStudent.student_id,
        firstName: newStudent.first_name,
        lastName: newStudent.last_name,
        birthYear: newStudent.birth_year,
        location: newStudent.location,
        active: newStudent.active,
      },
      students: allStudents.map(s => ({
        studentId: s.student_id,
        firstName: s.first_name,
        lastName: s.last_name,
        birthYear: s.birth_year,
        location: s.location,
        active: s.active,
      })),
    });
  } catch (error) {
    console.error("Add student error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas dodawania ucznia" },
      { status: 500 }
    );
  }
}
