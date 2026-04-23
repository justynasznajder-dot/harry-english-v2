import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, createStudent, emailExists, Location } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

interface StudentData {
  firstName: string;
  lastName: string;
  birthYear: string;
  location: Location;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      students, // Tablica dzieci: [{ firstName, lastName, birthYear, location }, ...]
      rodoConsent,
    } = body;

    // Walidacja
    if (!email || !password || !firstName || !lastName || !students || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { message: "Wszystkie pola są wymagane" },
        { status: 400 }
      );
    }

    if (!rodoConsent) {
      return NextResponse.json(
        { message: "Zgoda RODO jest wymagana" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { message: "Hasła nie są identyczne" },
        { status: 400 }
      );
    }

    // Sprawdź czy email jest poprawny
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: "Nieprawidłowy adres email" },
        { status: 400 }
      );
    }

    // Walidacja hasła
    if (password.length < 8) {
      return NextResponse.json(
        { message: "Hasło musi mieć minimum 8 znaków" },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return NextResponse.json(
        { message: "Hasło nie spełnia wymagań bezpieczeństwa" },
        { status: 400 }
      );
    }

    // Walidacja danych dzieci
    const currentYear = new Date().getFullYear();
    for (const student of students as StudentData[]) {
      if (!student.firstName?.trim() || !student.lastName?.trim() || !student.birthYear || !student.location) {
        return NextResponse.json(
          { message: "Wszystkie pola dziecka są wymagane" },
          { status: 400 }
        );
      }

      const birthYear = parseInt(student.birthYear);
      if (!birthYear || birthYear < 2000 || birthYear > currentYear) {
        return NextResponse.json(
          { message: `Nieprawidłowy rok urodzenia dziecka: ${student.birthYear}. Musi być między 2000 a ${currentYear}` },
          { status: 400 }
        );
      }

      const validLocations: Location[] = ['Paniówki', 'Halemba', 'Orzegów', 'Kochłowice', 'Bielszowice'];
      if (!validLocations.includes(student.location)) {
        return NextResponse.json(
          { message: `Nieprawidłowa lokalizacja: ${student.location}` },
          { status: 400 }
        );
      }
    }

    // Sprawdź czy użytkownik już istnieje
    const userExists = await emailExists(email);
    if (userExists) {
      return NextResponse.json(
        { message: "Użytkownik z tym adresem email już istnieje" },
        { status: 409 }
      );
    }

    // Hashuj hasło
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Utwórz nowego użytkownika w bazie danych
    // Domyślnie account_type = 'user'
    const newUser = await createUser({
      email,
      passwordHash,
      firstName,
      lastName,
      accountType: 'user',
    });

    // Utwórz rekordy dla wszystkich dzieci
    const createdStudents = [];
    for (const student of students as StudentData[]) {
      const newStudent = await createStudent({
        userId: newUser.id,
        firstName: student.firstName.trim(),
        lastName: student.lastName.trim(),
        birthYear: student.birthYear,
        location: student.location,
      });
      createdStudents.push(newStudent);
    }

    // Wyślij email powitalny (używamy pierwszego dziecka w powitaniu)
    try {
      await sendWelcomeEmail(
        email,
        firstName,
        lastName,
        students[0].firstName
      );
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
      // Nie przerywamy procesu rejestracji, jeśli email się nie wyśle
    }

    // Zwróć token (w wersji produkcyjnej użyj JWT)
    const token = Buffer.from(`${newUser.id}:${Date.now()}`).toString("base64");

    const response = NextResponse.json({
      message: "Konto zostało utworzone pomyślnie",
      token,
      userName: `${firstName} ${lastName}`,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        accountType: newUser.account_type,
        students: createdStudents.map(s => ({
          studentId: s.student_id,
          firstName: s.first_name,
          lastName: s.last_name,
          birthYear: s.birth_year,
          location: s.location,
          active: s.active,
        })),
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
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas tworzenia konta" },
      { status: 500 }
    );
  }
}
