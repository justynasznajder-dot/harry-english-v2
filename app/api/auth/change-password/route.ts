import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  clearMustChangePassword,
  getUserById,
  updateUserPasswordHash,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { validateStrongPassword } from "@/lib/password";

/**
 * Zmiana hasła — używana po pierwszym logowaniu, gdy `must_change_password = TRUE`,
 * a także jako zwykła zmiana hasła z poziomu konta.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json(
        { message: "Nieautoryzowany dostęp" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword.trim() : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword.trim() : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: "Podaj aktualne i nowe hasło" },
        { status: 400 }
      );
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { message: "Użytkownik nie istnieje" },
        { status: 404 }
      );
    }

    // Sprawdź aktualne hasło (zachowanie spójne z /api/auth/login — wspiera stary `$2y$` hash).
    const rawHash = typeof user.password_hash === "string" ? user.password_hash : "";
    const hashCandidates = Array.from(
      new Set([
        rawHash,
        rawHash.trim(),
        rawHash.trim().replace(/^\$2y\$/, "$2b$"),
      ])
    ).filter((candidate) => candidate.length > 0);

    let currentValid = false;
    for (const candidate of hashCandidates) {
      try {
        if (await bcrypt.compare(currentPassword, candidate)) {
          currentValid = true;
          break;
        }
      } catch {
        // pomiń uszkodzony hash
      }
    }
    if (!currentValid) {
      return NextResponse.json(
        { message: "Aktualne hasło jest nieprawidłowe" },
        { status: 400 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { message: "Nowe hasło musi być inne niż aktualne" },
        { status: 400 }
      );
    }

    const validation = validateStrongPassword(newPassword);
    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.message ?? "Hasło nie spełnia wymagań bezpieczeństwa" },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await updateUserPasswordHash(user.id, newHash);
    await clearMustChangePassword(user.id);

    return NextResponse.json({ message: "Hasło zostało zmienione" });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { message: "Wystąpił błąd podczas zmiany hasła" },
      { status: 500 }
    );
  }
}
