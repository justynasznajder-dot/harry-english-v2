import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  clearResetTokenByUserId,
  getUserByEmail,
  setResetTokenByUserId,
} from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_SUCCESS_MESSAGE =
  "Jeśli konto z tym adresem email istnieje, wysłaliśmy link do resetowania hasła";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json(
        { message: "Email jest wymagany" },
        { status: 400 }
      );
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ message: "Nieprawidłowy format adresu email" }, { status: 400 });
    }

    // Znajdź użytkownika w bazie danych
    const user = await getUserByEmail(email);

    // Ze względów bezpieczeństwa zawsze zwracamy sukces, 
    // nawet jeśli użytkownik nie istnieje
    if (!user || !user.active) {
      return NextResponse.json({
        message: GENERIC_SUCCESS_MESSAGE,
      });
    }

    // Wygeneruj token resetowania hasła
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 godzina

    // Zapisz nowy token (nadpisuje poprzedni) — każdy request generuje nowy, jednorazowy link
    const tokenSaved = await setResetTokenByUserId(user.id, resetToken, resetTokenExpiry);
    if (!tokenSaved) {
      return NextResponse.json(
        { message: "Nie udało się wygenerować nowego linku resetowania hasła" },
        { status: 500 }
      );
    }

    // Wyślij email z linkiem do resetu
    try {
      await sendPasswordResetEmail(
        user.email,
        resetToken,
        user.first_name
      );
      console.log(`✅ Password reset email sent to ${user.email}`);
    } catch (emailError) {
      // Uszczelnienie: nie zostawiamy aktywnego tokenu, jeśli email nie został wysłany.
      await clearResetTokenByUserId(user.id);
      console.error('❌ Failed to send password reset email:', emailError);
      return NextResponse.json(
        { message: "Wystąpił błąd podczas wysyłania emaila" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: GENERIC_SUCCESS_MESSAGE,
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas przetwarzania żądania" },
      { status: 500 }
    );
  }
}
