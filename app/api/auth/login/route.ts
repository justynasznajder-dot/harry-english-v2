import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, updateLastLogin } from "@/lib/db";
import { signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email i hasło są wymagane" },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        { message: "Nieprawidłowy email lub hasło" },
        { status: 401 }
      );
    }

    const rawHash = typeof user.password_hash === "string" ? user.password_hash : "";
    const hashCandidates = Array.from(
      new Set([
        rawHash,
        rawHash.trim(),
        rawHash.trim().replace(/^\$2y\$/, "$2b$"),
      ])
    ).filter((candidate) => candidate.length > 0);

    let isPasswordValid = false;
    for (const candidate of hashCandidates) {
      try {
        if (await bcrypt.compare(password, candidate)) {
          isPasswordValid = true;
          break;
        }
      } catch {
        // Ignore malformed candidate and continue with next one.
      }
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { message: "Nieprawidłowy email lub hasło" },
        { status: 401 }
      );
    }

    if (user.role === "PARENT") {
      return NextResponse.json(
        {
          message:
            "Panel rodzica jest w przygotowaniu. W sprawie zgłoszenia skontaktuj się z biurem szkoły.",
        },
        { status: 403 }
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
