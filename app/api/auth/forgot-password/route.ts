import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserByEmail, setResetToken } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { message: "Email jest wymagany" },
        { status: 400 }
      );
    }

    // Znajdź użytkownika w bazie danych
    const user = await getUserByEmail(email);

    // Ze względów bezpieczeństwa zawsze zwracamy sukces, 
    // nawet jeśli użytkownik nie istnieje
    if (!user) {
      return NextResponse.json({
        message: "Jeśli konto z tym adresem email istnieje, wysłaliśmy link do resetowania hasła"
      });
    }

    // Wygeneruj token resetowania hasła
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 godzina

    // Zapisz token w bazie danych
    await setResetToken(user.email, resetToken, resetTokenExpiry);

    // Wyślij email z linkiem do resetu
    try {
      await sendPasswordResetEmail(
        user.email,
        resetToken,
        user.first_name
      );
      console.log(`✅ Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
      return NextResponse.json(
        { message: "Wystąpił błąd podczas wysyłania emaila" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Jeśli konto z tym adresem email istnieje, wysłaliśmy link do resetowania hasła"
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas przetwarzania żądania" },
      { status: 500 }
    );
  }
}
