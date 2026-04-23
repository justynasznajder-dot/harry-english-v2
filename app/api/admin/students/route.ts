import { NextRequest, NextResponse } from "next/server";
import { getAllStudents, getStudentsByUserId, isAdmin, createStudent } from "@/lib/db";

// GET - pobierz studentów z filtrami
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
    const filterUserId = searchParams.get('userId');
    const filterActive = searchParams.get('active');

    let students;

    if (filterUserId) {
      students = await getStudentsByUserId(filterUserId);
    } else {
      students = await getAllStudents();
    }

    // Filtruj po active jeśli podano
    if (filterActive !== null) {
      const active = filterActive === 'true';
      students = students.filter(s => s.active === active);
    }

    return NextResponse.json({ students });
  } catch (error) {
    console.error("Get students error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas pobierania studentów" },
      { status: 500 }
    );
  }
}

// POST - dodaj nowego studenta
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
    const { userId: targetUserId, firstName, lastName, birthYear, location, active } = body;

    // Walidacja
    if (!targetUserId || !firstName || !lastName || !birthYear || !location) {
      return NextResponse.json(
        { message: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    // Utwórz studenta
    const newStudent = await createStudent({
      userId: targetUserId,
      firstName,
      lastName,
      birthYear,
      location,
    });

    // Jeśli active jest podane, zaktualizuj
    if (active !== undefined) {
      const { updateStudent } = await import('@/lib/db');
      await updateStudent(newStudent.student_id, { active });
    }

    return NextResponse.json({ student: newStudent, message: "Student został utworzony" });
  } catch (error) {
    console.error("Create student error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas tworzenia studenta" },
      { status: 500 }
    );
  }
}
