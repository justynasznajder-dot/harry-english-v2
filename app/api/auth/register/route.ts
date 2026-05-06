import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  createParentUserWithChildren,
  emailExists,
  getDbShape,
  getRegistrationSchoolId,
  queryDb,
  setResetToken,
  updateLastLogin,
} from "@/lib/db";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/email";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPasswordStrong(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
  return true;
}

/** Hasło generowane przy zgłoszeniu bez pola hasła w formularzu — spełnia reguły siły. */
function generateTemporaryPassword(): string {
  return `Aa9!${crypto.randomBytes(20).toString("hex")}`;
}

function parseIsoDateOnly(s: string): Date | null {
  if (!ISO_DATE_REGEX.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

interface ChildInput {
  firstName?: string;
  lastName?: string;
  birthDate?: string | Date;
  preferredLocationId?: string;
}

function normalizeParentPhone(raw: unknown):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, message: "Numer telefonu jest wymagany" };
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9) {
    return { ok: false, message: "Podaj numer telefonu z co najmniej 9 cyframi" };
  }
  return { ok: true, value: s };
}

function normalizeBirthDate(value: string | Date | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Format DD.MM.YYYY
  const plMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (plMatch) {
    const [, dd, mm, yyyy] = plMatch;
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (
      dt.getFullYear() === Number(yyyy) &&
      dt.getMonth() === Number(mm) - 1 &&
      dt.getDate() === Number(dd)
    ) {
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  // ISO-like or Date string supported by JS Date parser
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.SCHOOL_ID?.trim()) {
      return NextResponse.json(
        { message: "Brak zmiennej środowiskowej SCHOOL_ID — rejestracja niedostępna." },
        { status: 500 }
      );
    }
    const schoolId = getRegistrationSchoolId();
    if (!schoolId?.trim()) {
      return NextResponse.json(
        { message: "Nie skonfigurowano identyfikatora szkoły (SCHOOL_ID)." },
        { status: 500 }
      );
    }
    const shape = await getDbShape();
    if (shape.hasChildrenTable && !shape.hasStudentsTable) {
      // W nowym schemacie oczekujemy tabeli children z kolumną birth_date.
      // Szybki check zapewnia czytelny komunikat zamiast ogólnego 500.
      const hasBirthDateColumn = await queryDb<{
        exists: boolean;
      }>(
        `SELECT EXISTS(
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'children'
             AND column_name = 'birth_date'
         ) AS exists`
      );
      if (!hasBirthDateColumn.rows[0]?.exists) {
        return NextResponse.json(
          { message: "Brak kolumny children.birth_date w bazie danych" },
          { status: 500 }
        );
      }
    }

    const body = await request.json();
    const {
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      phone,
      children,
      rodoConsent,
    } = body;

    if (
      !email ||
      !firstName ||
      !lastName ||
      !children ||
      !Array.isArray(children) ||
      children.length === 0
    ) {
      return NextResponse.json(
        { message: "Wszystkie pola są wymagane (w tym co najmniej jedno dziecko)" },
        { status: 400 }
      );
    }

    if (!rodoConsent) {
      return NextResponse.json(
        { message: "Zgoda RODO jest wymagana" },
        { status: 400 }
      );
    }

    const passwordRaw =
      typeof password === "string" && password.trim().length > 0
        ? password.trim()
        : null;

    if (passwordRaw != null) {
      if (passwordRaw !== String(confirmPassword ?? "").trim()) {
        return NextResponse.json(
          { message: "Hasła nie są identyczne" },
          { status: 400 }
        );
      }
      if (!isPasswordStrong(passwordRaw)) {
        return NextResponse.json(
          {
            message:
              "Hasło musi mieć min. 8 znaków oraz: wielką literę, małą literę, cyfrę i znak specjalny",
          },
          { status: 400 }
        );
      }
    }

    if (!EMAIL_REGEX.test(String(email))) {
      return NextResponse.json(
        { message: "Nieprawidłowy adres email" },
        { status: 400 }
      );
    }

    const phoneNorm = normalizeParentPhone(phone);
    if (!phoneNorm.ok) {
      return NextResponse.json({ message: phoneNorm.message }, { status: 400 });
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const minYear = 2000;

    for (let i = 0; i < children.length; i++) {
      const c = children[i] as ChildInput;
      const fn = c.firstName?.trim();
      const ln = c.lastName?.trim();
      const bd = normalizeBirthDate(c.birthDate);

      if (!fn || !ln || !bd) {
        return NextResponse.json(
          { message: `Dziecko ${i + 1}: wymagane imię, nazwisko i data urodzenia (YYYY-MM-DD)` },
          { status: 400 }
        );
      }

      const parsed = parseIsoDateOnly(bd);
      if (!parsed) {
        return NextResponse.json(
          { message: `Dziecko ${i + 1}: nieprawidłowa data urodzenia (oczekiwany format YYYY-MM-DD)` },
          { status: 400 }
        );
      }

      if (parsed.getFullYear() < minYear) {
        return NextResponse.json(
          { message: `Dziecko ${i + 1}: rok urodzenia nie może być wcześniejszy niż ${minYear}` },
          { status: 400 }
        );
      }

      if (parsed > today) {
        return NextResponse.json(
          { message: `Dziecko ${i + 1}: data urodzenia nie może być w przyszłości` },
          { status: 400 }
        );
      }

      if (shape.childHasPreferredLocationId && shape.hasChildrenTable) {
        const locId = String(c.preferredLocationId ?? "").trim();
        if (!locId || !LOCATION_ID_REGEX.test(locId)) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: wybierz lokalizację` },
            { status: 400 }
          );
        }
        const locOk = await queryDb<{ ok: boolean }>(
          `SELECT TRUE AS ok
           FROM locations
           WHERE id = $1 AND school_id = $2 AND active = TRUE
           LIMIT 1`,
          [locId, schoolId]
        );
        if (!locOk.rows[0]?.ok) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: nieprawidłowa lokalizacja` },
            { status: 400 }
          );
        }
      }
    }

    const exists = await emailExists(email, schoolId);
    if (exists) {
      return NextResponse.json(
        { message: "Użytkownik z tym adresem email już istnieje" },
        { status: 409 }
      );
    }

    const effectivePassword = passwordRaw ?? generateTemporaryPassword();
    const passwordWasGenerated = passwordRaw == null;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(effectivePassword, salt);

    const normalizedChildren = (children as ChildInput[]).map((c) => ({
      firstName: c.firstName!.trim(),
      lastName: c.lastName!.trim(),
      birthDate: normalizeBirthDate(c.birthDate)!,
      preferredLocationId:
        shape.childHasPreferredLocationId && shape.hasChildrenTable
          ? String(c.preferredLocationId ?? "").trim()
          : null,
    }));

    const { user: newUser } = await createParentUserWithChildren({
      email,
      passwordHash,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      schoolId,
      phone: phoneNorm.value,
      accessLevel: "PENDING",
      children: normalizedChildren,
    });

    try {
      await sendWelcomeEmail(
        email,
        newUser.first_name,
        newUser.last_name,
        normalizedChildren[0].firstName
      );
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
    }

    if (passwordWasGenerated) {
      try {
        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetTokenExpiry = new Date(Date.now() + 3600000);
        await setResetToken(email, resetToken, resetTokenExpiry);
        await sendPasswordResetEmail(email, resetToken, newUser.first_name);
      } catch (e) {
        console.error("Failed to send set-password email after registration:", e);
      }
    }

    try {
      await updateLastLogin(newUser.id);
    } catch (loginColErr) {
      console.warn("updateLastLogin after register:", loginColErr);
    }

    const token = Buffer.from(`${newUser.id}:${Date.now()}`).toString("base64");

    const response = NextResponse.json({
      message: "Konto zostało utworzone pomyślnie",
      token,
      userName: `${newUser.first_name} ${newUser.last_name}`,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        accessLevel: newUser.access_level,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
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
  } catch (error: unknown) {
    console.error("Registration error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (
      msg.includes("unique") ||
      msg.includes("UNIQUE") ||
      msg.includes("duplicate key")
    ) {
      return NextResponse.json(
        { message: "Użytkownik z tym adresem email już istnieje" },
        { status: 409 }
      );
    }
    if (/foreign key|violates foreign key/i.test(msg)) {
      return NextResponse.json(
        {
          message:
            "Nie można zapisać konta — problem z powiązaniami w bazie (np. szkoła lub uprawnienia). Skontaktuj się z administratorem.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { message: "Wystąpił błąd podczas tworzenia konta" },
      { status: 500 }
    );
  }
}
