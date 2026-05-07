import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getRegistrationSchoolId, getUserByEmail, updateLastLogin } from "@/lib/db";
import { signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const isDev = process.env.NODE_ENV !== "production";
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const schoolId = getRegistrationSchoolId();

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email i hasło są wymagane" },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);

    if (!user) {
      console.warn("Login denied: user not found in tenant", {
        email,
        schoolId,
      });
      return NextResponse.json(
        { message: isDev ? "Nie znaleziono użytkownika o podanym emailu" : "Nieprawidłowy email lub hasło" },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      console.warn("Login denied: password mismatch", {
        email,
        schoolId,
        userId: user.id,
        userSchoolId: user.school_id,
        hashPrefix: user.password_hash?.slice(0, 4),
      });
      return NextResponse.json(
        { message: isDev ? "Hasło nie pasuje do użytkownika" : "Nieprawidłowy email lub hasło" },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { message: "To konto jest nieaktywne. Skontaktuj się z administracją szkoły." },
        { status: 403 }
      );
    }

    await updateLastLogin(user.id);

    const token = await signToken({
      userId: user.id,
      role: user.role,
      schoolId: user.school_id ?? null,
      accessLevel: user.access_level,
    });

    const response = NextResponse.json({
      message: "Zalogowano pomyślnie",
      token,
      userName: `${user.first_name} ${user.last_name}`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        accessLevel: user.access_level,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
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
