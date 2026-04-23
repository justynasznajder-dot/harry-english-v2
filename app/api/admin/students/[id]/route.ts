import { NextRequest, NextResponse } from "next/server";
import { isAdmin, updateStudent, deleteStudent, getAllStudents, restoreStudent } from "@/lib/db";

// PUT - aktualizuj studenta
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
    const studentId = id;
    const body = await request.json();

    // Sprawdź czy to operacja przywracania
    if (body.restore === true) {
      const restored = await restoreStudent(studentId);
      if (!restored) {
        return NextResponse.json({ message: "Student nie został znaleziony" }, { status: 404 });
      }
      const allStudents = await getAllStudents();
      const student = allStudents.find(s => s.student_id === studentId);
      if (!student) {
        return NextResponse.json({ message: "Nie można pobrać zaktualizowanych danych" }, { status: 404 });
      }
      return NextResponse.json({ student, message: "Student został przywrócony" });
    }

    const updateData: any = {};
    if (body.first_name !== undefined) updateData.first_name = body.first_name;
    if (body.last_name !== undefined) updateData.last_name = body.last_name;
    if (body.birth_year !== undefined) updateData.birth_year = body.birth_year;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.active !== undefined) updateData.active = body.active;
    if (body.resignation_requested !== undefined) updateData.resignation_requested = body.resignation_requested;
    if (body.resignation_reason !== undefined) updateData.resignation_reason = body.resignation_reason;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "Brak danych do aktualizacji" }, { status: 400 });
    }

    const updated = await updateStudent(studentId, updateData);

    if (!updated) {
      return NextResponse.json({ message: "Student nie został znaleziony" }, { status: 404 });
    }

    // Pobierz zaktualizowanego studenta
    const allStudents = await getAllStudents();
    const student = allStudents.find(s => s.student_id === studentId);

    if (!student) {
      return NextResponse.json({ message: "Nie można pobrać zaktualizowanych danych" }, { status: 404 });
    }

    return NextResponse.json({ student, message: "Student został zaktualizowany" });
  } catch (error) {
    console.error("Update student error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas aktualizacji studenta" },
      { status: 500 }
    );
  }
}

// DELETE - usuń studenta
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
    const studentId = id;
    
    console.log(`Attempting to mark student ${studentId} as former`);
    const deleted = await deleteStudent(studentId);

    if (!deleted) {
      console.log(`Student ${studentId} not found`);
      return NextResponse.json({ message: "Student nie został znaleziony" }, { status: 404 });
    }

    console.log(`Student ${studentId} successfully marked as former`);
    
    // Pobierz zaktualizowanego studenta
    const { getAllStudents } = await import('@/lib/db');
    const allStudents = await getAllStudents();
    const student = allStudents.find(s => s.student_id === studentId);

    return NextResponse.json({ 
      student, 
      message: "Student został oznaczony jako były uczeń" 
    });
  } catch (error) {
    console.error("Delete student error:", error);
    const errorMessage = error instanceof Error ? error.message : "Wystąpił błąd podczas usuwania studenta";
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
  }
}
