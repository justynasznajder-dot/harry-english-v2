import { NextRequest, NextResponse } from 'next/server';
import { requestStudentResignation, getStudentById } from '@/lib/db';
import { sendResignationEmail } from '@/lib/email';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'Brak autoryzacji' },
        { status: 401 }
      );
    }

    // Weryfikuj token - Login używa base64, więc dekodujemy base64
    let userId: string;
    try {
      // Spróbuj JWT (jeśli w przyszłości zmienimy na JWT)
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as TokenPayload;
      userId = decoded.userId;
    } catch (jwtError: any) {
      // Fallback: dekoduj base64 (jak w innych endpointach)
      try {
        const tokenData = Buffer.from(token, 'base64').toString();
        userId = tokenData.split(':')[0];
      } catch (base64Error: any) {
        return NextResponse.json(
          { message: 'Nieprawidłowy token' },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    const { studentId, reason } = body;

    if (!studentId || !reason || !reason.trim()) {
      return NextResponse.json(
        { message: 'Brakuje wymaganych danych (studentId, reason)' },
        { status: 400 }
      );
    }

    // Sprawdź czy student istnieje i należy do użytkownika
    const student = await getStudentById(studentId);
    if (!student || student.user_id !== userId) {
      return NextResponse.json(
        { message: 'Student nie został znaleziony lub nie należy do użytkownika' },
        { status: 404 }
      );
    }

    // Aktualizuj rezygnację w bazie
    const success = await requestStudentResignation(studentId, userId, reason.trim());

    if (!success) {
      return NextResponse.json(
        { message: 'Nie udało się zaktualizować rezygnacji' },
        { status: 500 }
      );
    }

    // Pobierz dane rodzica
    const { getUserById } = await import('@/lib/db');
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { message: 'Użytkownik nie został znaleziony' },
        { status: 404 }
      );
    }

    // Wyślij email o rezygnacji
    try {
      await sendResignationEmail(
        user.first_name,
        user.last_name,
        user.email,
        student.first_name,
        student.last_name,
        student.student_id,
        reason.trim()
      );
    } catch (emailError) {
      console.error('Error sending resignation email:', emailError);
      // Nie przerywamy procesu, nawet jeśli email się nie wysłał
    }

    return NextResponse.json({
      message: 'Rezygnacja została zgłoszona pomyślnie',
      success: true
    });
  } catch (error: any) {
    console.error('Error in resign endpoint:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return NextResponse.json(
        { message: 'Nieprawidłowy token' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { message: 'Wystąpił błąd podczas przetwarzania rezygnacji' },
      { status: 500 }
    );
  }
}
