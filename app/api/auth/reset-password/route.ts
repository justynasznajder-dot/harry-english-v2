import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByResetToken, resetPassword } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        { message: "Token i nowe hasło są wymagane" },
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

    // Sprawdź czy token jest prawidłowy i nie wygasł
    const user = await getUserByResetToken(token);

    if (!user) {
      return NextResponse.json(
        { message: "Nieprawidłowy lub wygasły token resetowania hasła" },
        { status: 400 }
      );
    }

    // Hashuj nowe hasło
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Zaktualizuj hasło i usuń token
    const success = await resetPassword(token, passwordHash);

    if (!success) {
      return NextResponse.json(
        { message: "Nie udało się zresetować hasła" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Hasło zostało pomyślnie zmienione. Możesz się teraz zalogować."
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas resetowania hasła" },
      { status: 500 }
    );
  }
}
