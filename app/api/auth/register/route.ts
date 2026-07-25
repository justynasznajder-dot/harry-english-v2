import { NextResponse } from "next/server";
/**
 * Publiczne zgłoszenie dziecka — zapis do `enrollment_requests` (bez tworzenia konta).
 * Ręczne dodanie rodzica w panelu: `createParentUserWithEnrollmentRequests` (konto + zgłoszenia).
 */
import {
  DuplicateEnrollmentError,
  findUserBySchoolAndEmail,
  getRegistrationSchoolId,
  insertPublicEnrollmentRequests,
  queryDb,
  updateUser,
} from "@/lib/db";
import { formatPersonName } from "@/lib/format-person-name";
import {
  sendEnrollmentConfirmationToParent,
  sendPublicEnrollmentBackupEmail,
} from "@/lib/email";
import { normalizePolishPhone } from "@/lib/phone";
import { pgDateToYmd } from "@/lib/school-timezone";

/** Kopia mailowa zgłoszeń na kontakt@ dla wskazanych szkół (prod + dev). */
const ENROLLMENT_BACKUP_EMAIL_SCHOOL_IDS = new Set([
  "c93d5ac1-fa59-497f-b450-a4e50e1fb50d", // PROD
  "efcb641a-e5bd-4e59-aa39-c08fd1b318e9", // DEV
]);

function shouldSendEnrollmentBackupEmail(schoolId: string): boolean {
  return ENROLLMENT_BACKUP_EMAIL_SCHOOL_IDS.has(
    schoolId.trim().toLowerCase(),
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  return { ok: true, value: normalizePolishPhone(s) };
}

function normalizeBirthDate(value: string | Date | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return pgDateToYmd(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

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

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  return pgDateToYmd(raw);
}

/** Publiczne zgłoszenie dziecka — zapis wyłącznie do `enrollment_requests` (bez konta rodzica). */
export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.SCHOOL_ID?.trim()) {
      return NextResponse.json(
        { message: "Brak zmiennej środowiskowej SCHOOL_ID — formularz niedostępny." },
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
    let schoolName = schoolId;
    try {
      const schoolRes = await queryDb<{ name: string }>(
        `SELECT name
         FROM schools
         WHERE id = $1
         LIMIT 1`,
        [schoolId]
      );
      schoolName = schoolRes.rows[0]?.name?.trim() || schoolId;
    } catch (schoolErr) {
      console.error("Enrollment email: school name lookup failed:", schoolErr);
    }

    const body = await request.json();
    const {
      email,
      firstName,
      lastName,
      phone,
      children,
      rodoConsent,
      confirmExistingAccount,
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

    if (!EMAIL_REGEX.test(String(email))) {
      return NextResponse.json(
        { message: "Nieprawidłowy adres email" },
        { status: 400 }
      );
    }

    const parentEmailNormalized = String(email).trim().toLowerCase();

    const phoneNorm = normalizeParentPhone(phone);
    if (!phoneNorm.ok) {
      return NextResponse.json({ message: phoneNorm.message }, { status: 400 });
    }

    const schoolLocationsRes = await queryDb<{ ok: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM locations WHERE school_id = $1 AND active = TRUE
       ) AS ok`,
      [schoolId]
    );
    const enrollmentRequiresLocation = Boolean(schoolLocationsRes.rows[0]?.ok);

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
          {
            message: `Dziecko ${i + 1}: wymagane imię, nazwisko i data urodzenia (YYYY-MM-DD)`,
          },
          { status: 400 }
        );
      }

      const parsed = parseIsoDateOnly(bd);
      if (!parsed) {
        return NextResponse.json(
          {
            message: `Dziecko ${i + 1}: nieprawidłowa data urodzenia (oczekiwany format YYYY-MM-DD)`,
          },
          { status: 400 }
        );
      }

      if (parsed.getFullYear() < minYear) {
        return NextResponse.json(
          {
            message: `Dziecko ${i + 1}: rok urodzenia nie może być wcześniejszy niż ${minYear}`,
          },
          { status: 400 }
        );
      }

      if (parsed > today) {
        return NextResponse.json(
          {
            message: `Dziecko ${i + 1}: data urodzenia nie może być w przyszłości`,
          },
          { status: 400 }
        );
      }

      const locIdRaw = String(c.preferredLocationId ?? "").trim();
      if (enrollmentRequiresLocation) {
        if (!locIdRaw || !LOCATION_ID_REGEX.test(locIdRaw)) {
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
          [locIdRaw, schoolId]
        );
        if (!locOk.rows[0]?.ok) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: nieprawidłowa lokalizacja` },
            { status: 400 }
          );
        }
      } else if (locIdRaw) {
        if (!LOCATION_ID_REGEX.test(locIdRaw)) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: nieprawidłowa lokalizacja` },
            { status: 400 }
          );
        }
        const locOk = await queryDb<{ ok: boolean }>(
          `SELECT TRUE AS ok
           FROM locations
           WHERE id = $1 AND school_id = $2 AND active = TRUE
           LIMIT 1`,
          [locIdRaw, schoolId]
        );
        if (!locOk.rows[0]?.ok) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: nieprawidłowa lokalizacja` },
            { status: 400 }
          );
        }
      }
    }

    const normalizedChildren = (children as ChildInput[]).map((c) => ({
      firstName: c.firstName!.trim(),
      lastName: c.lastName!.trim(),
      birthDate: normalizeBirthDate(c.birthDate)!,
      preferredLocationId: String(c.preferredLocationId ?? "").trim() || null,
    }));

    const locationNameById = new Map<string, string>();
    const locIds = [
      ...new Set(
        normalizedChildren
          .map((c) => c.preferredLocationId)
          .filter((id): id is string => Boolean(id && id.length > 0)),
      ),
    ];
    if (locIds.length > 0) {
      try {
        const placeholders = locIds.map((_, j) => `$${j + 2}`).join(", ");
        const locRes = await queryDb<{ id: string; name: string }>(
          `SELECT id, name FROM locations WHERE school_id = $1 AND id IN (${placeholders})`,
          [schoolId, ...locIds]
        );
        for (const row of locRes.rows) {
          locationNameById.set(row.id, row.name);
        }
      } catch (locLookupErr) {
        console.error(
          "Enrollment email: lookup location names failed:",
          locLookupErr,
        );
      }
    }

    const enrollmentChildren = normalizedChildren.map((c, idx) => {
      const lid = c.preferredLocationId;
      const label = lid
        ? (locationNameById.get(lid) ?? lid)
        : "— (nie podano)";
      return {
        index: idx + 1,
        firstName: c.firstName,
        lastName: c.lastName,
        birthDate: c.birthDate,
        preferredLocationLabel: label,
      };
    });

    const existingParent = await findUserBySchoolAndEmail(
      schoolId,
      parentEmailNormalized
    );
    const existingParentAccount =
      existingParent && existingParent.role === "PARENT" ? existingParent : null;

    if (existingParentAccount && confirmExistingAccount !== true) {
      const accountName =
        `${existingParentAccount.first_name} ${existingParentAccount.last_name}`.trim();
      return NextResponse.json(
        {
          code: "EXISTING_ACCOUNT_CONFIRMATION_REQUIRED",
          message: `Na ten email jest już konto ${accountName}. Potwierdź, aby kontynuować — zgłoszenie będzie powiązane z tym kontem.`,
          existingAccount: {
            firstName: existingParentAccount.first_name,
            lastName: existingParentAccount.last_name,
          },
        },
        { status: 409 }
      );
    }

    const enrollmentEmailPayload = {
      parentFirstName: String(firstName).trim(),
      parentLastName: String(lastName).trim(),
      parentEmail: parentEmailNormalized,
      children: enrollmentChildren,
    };

    let enrollmentBackupPayload: Parameters<
      typeof sendPublicEnrollmentBackupEmail
    >[0] | null = null;
    if (shouldSendEnrollmentBackupEmail(schoolId)) {
      enrollmentBackupPayload = {
        schoolId,
        schoolName,
        parentFirstName: enrollmentEmailPayload.parentFirstName,
        parentLastName: enrollmentEmailPayload.parentLastName,
        parentEmail: enrollmentEmailPayload.parentEmail,
        parentPhone: phoneNorm.value,
        rodoConsent: true,
        children: enrollmentEmailPayload.children,
        dbSaveOk: true,
      };
    }

    try {
      if (existingParentAccount) {
        await updateUser(existingParentAccount.id, {
          first_name: formatPersonName(String(firstName).trim()),
          last_name: formatPersonName(String(lastName).trim()),
          phone: phoneNorm.value,
        });
      }
      await insertPublicEnrollmentRequests({
        schoolId,
        email: parentEmailNormalized,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone: phoneNorm.value,
        children: normalizedChildren,
        userId: existingParentAccount?.id ?? null,
      });
    } catch (insertErr) {
      if (insertErr instanceof DuplicateEnrollmentError) {
        return NextResponse.json({ message: insertErr.message }, { status: 409 });
      }
      if (enrollmentBackupPayload) {
        try {
          await sendPublicEnrollmentBackupEmail({
            ...enrollmentBackupPayload,
            dbSaveOk: false,
            dbErrorMessage:
              insertErr instanceof Error
                ? insertErr.message
                : String(insertErr),
          });
        } catch (mailErr) {
          console.error(
            "Enrollment backup email after DB error failed:",
            mailErr,
          );
        }
      }
      throw insertErr;
    }

    const postSaveEmailJobs: Array<Promise<void>> = [];
    if (enrollmentBackupPayload) {
      postSaveEmailJobs.push(
        sendPublicEnrollmentBackupEmail({
          ...enrollmentBackupPayload,
          dbSaveOk: true,
        })
      );
    }
    postSaveEmailJobs.push(
      sendEnrollmentConfirmationToParent({
        parentFirstName: enrollmentEmailPayload.parentFirstName,
        parentLastName: enrollmentEmailPayload.parentLastName,
        parentEmail: enrollmentEmailPayload.parentEmail,
        children: enrollmentEmailPayload.children,
      })
    );
    const postSaveEmailResults = await Promise.allSettled(postSaveEmailJobs);
    postSaveEmailResults.forEach((result) => {
      if (result.status === "rejected") {
        console.error("Enrollment post-save email failed:", result.reason);
      }
    });

    return NextResponse.json({
      message:
        "Zgłoszenie zostało zapisane. Skontaktujemy się z Tobą po weryfikacji.",
    });
  } catch (error: unknown) {
    console.error("Public enrollment error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (/foreign key|violates foreign key/i.test(msg)) {
      return NextResponse.json(
        {
          message:
            "Nie można zapisać zgłoszenia — problem z konfiguracją szkoły w bazie. Skontaktuj się z administratorem.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { message: "Wystąpił błąd podczas wysyłania zgłoszenia" },
      { status: 500 }
    );
  }
}
