import { NextRequest, NextResponse } from "next/server";
import {
  DuplicateEnrollmentError,
  getUserById,
  insertEnrollmentRequestsForParent,
  queryDb,
} from "@/lib/db";
import {
  sendEnrollmentConfirmationToParent,
  sendPublicEnrollmentBackupEmail,
} from "@/lib/email";
import { requireParentContext } from "@/lib/parent-portal-auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENROLLMENT_BACKUP_EMAIL_SCHOOL_IDS = new Set([
  "c93d5ac1-fa59-497f-b450-a4e50e1fb50d",
  "efcb641a-e5bd-4e59-aa39-c08fd1b318e9",
]);

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

/** Zalogowany rodzic: zgłoszenie kolejnego dziecka (powiązane z kontem). */
export async function POST(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  try {
    const parent = await getUserById(auth.ctx.parentId);
    if (!parent || parent.role !== "PARENT") {
      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
    }

    const body = await request.json();
    const childrenRaw = body?.children;
    if (!Array.isArray(childrenRaw) || childrenRaw.length === 0) {
      return NextResponse.json(
        { message: "Podaj co najmniej jedno dziecko" },
        { status: 400 }
      );
    }

    const schoolLocationsRes = await queryDb<{ ok: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM locations WHERE school_id = $1 AND active = TRUE
       ) AS ok`,
      [auth.ctx.schoolId]
    );
    const enrollmentRequiresLocation = Boolean(schoolLocationsRes.rows[0]?.ok);

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const normalizedChildren: Array<{
      firstName: string;
      lastName: string;
      birthDate: string;
      preferredLocationId: string | null;
    }> = [];

    for (let i = 0; i < childrenRaw.length; i++) {
      const c = childrenRaw[i] as {
        firstName?: string;
        lastName?: string;
        birthDate?: string;
        preferredLocationId?: string;
      };
      const firstName = String(c.firstName ?? "").trim();
      const lastName = String(c.lastName ?? "").trim();
      const birthDate = String(c.birthDate ?? "").trim().slice(0, 10);
      const locId = String(c.preferredLocationId ?? "").trim();

      if (!firstName || !lastName || !birthDate) {
        return NextResponse.json(
          {
            message: `Dziecko ${i + 1}: wymagane imię, nazwisko i data urodzenia`,
          },
          { status: 400 }
        );
      }

      const parsed = parseIsoDateOnly(birthDate);
      if (!parsed) {
        return NextResponse.json(
          { message: `Dziecko ${i + 1}: nieprawidłowa data urodzenia` },
          { status: 400 }
        );
      }
      if (parsed.getFullYear() < 2000) {
        return NextResponse.json(
          {
            message: `Dziecko ${i + 1}: rok urodzenia nie może być wcześniejszy niż 2000`,
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

      if (enrollmentRequiresLocation) {
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
          [locId, auth.ctx.schoolId]
        );
        if (!locOk.rows[0]?.ok) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: nieprawidłowa lokalizacja` },
            { status: 400 }
          );
        }
      } else if (locId) {
        if (!LOCATION_ID_REGEX.test(locId)) {
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
          [locId, auth.ctx.schoolId]
        );
        if (!locOk.rows[0]?.ok) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: nieprawidłowa lokalizacja` },
            { status: 400 }
          );
        }
      }

      normalizedChildren.push({
        firstName,
        lastName,
        birthDate,
        preferredLocationId: locId || null,
      });
    }

    const { enrollmentCount } = await insertEnrollmentRequestsForParent({
      parentId: auth.ctx.parentId,
      children: normalizedChildren,
    });

    const locationNameById = new Map<string, string>();
    const locIds = [
      ...new Set(
        normalizedChildren
          .map((c) => c.preferredLocationId)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    if (locIds.length > 0) {
      const placeholders = locIds.map((_, j) => `$${j + 2}`).join(", ");
      const locRes = await queryDb<{ id: string; name: string }>(
        `SELECT id, name FROM locations WHERE school_id = $1 AND id IN (${placeholders})`,
        [auth.ctx.schoolId, ...locIds]
      );
      for (const row of locRes.rows) {
        locationNameById.set(row.id, row.name);
      }
    }

    const enrollmentChildren = normalizedChildren.map((c, idx) => ({
      index: idx + 1,
      firstName: c.firstName,
      lastName: c.lastName,
      birthDate: c.birthDate,
      preferredLocationLabel: c.preferredLocationId
        ? (locationNameById.get(c.preferredLocationId) ?? c.preferredLocationId)
        : "— (nie podano)",
    }));

    const parentEmail = String(parent.email).trim().toLowerCase();
    if (EMAIL_REGEX.test(parentEmail)) {
      const jobs: Array<Promise<void>> = [
        sendEnrollmentConfirmationToParent({
          parentFirstName: parent.first_name,
          parentLastName: parent.last_name,
          parentEmail,
          children: enrollmentChildren,
        }),
      ];
      if (ENROLLMENT_BACKUP_EMAIL_SCHOOL_IDS.has(auth.ctx.schoolId)) {
        let schoolName = auth.ctx.schoolId;
        try {
          const schoolRes = await queryDb<{ name: string }>(
            `SELECT name FROM schools WHERE id = $1 LIMIT 1`,
            [auth.ctx.schoolId]
          );
          schoolName = schoolRes.rows[0]?.name?.trim() || schoolName;
        } catch {
          /* ignore */
        }
        jobs.push(
          sendPublicEnrollmentBackupEmail({
            schoolId: auth.ctx.schoolId,
            schoolName,
            parentFirstName: parent.first_name,
            parentLastName: parent.last_name,
            parentEmail,
            parentPhone: parent.phone ?? null,
            rodoConsent: true,
            children: enrollmentChildren,
            dbSaveOk: true,
          })
        );
      }
      const results = await Promise.allSettled(jobs);
      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Parent enrollment email failed:", result.reason);
        }
      });
    }

    return NextResponse.json({
      enrollmentCount,
      message:
        enrollmentCount === 1
          ? "Zgłoszenie dziecka zostało zapisane. Szkoła skontaktuje się z propozycją grupy."
          : `Zapisano ${enrollmentCount} zgłoszenia. Szkoła skontaktuje się z propozycją grupy.`,
    });
  } catch (error) {
    console.error("POST /api/parent/enrollment:", error);
    if (error instanceof DuplicateEnrollmentError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { message: "Nie udało się zapisać zgłoszenia" },
      { status: 500 }
    );
  }
}
