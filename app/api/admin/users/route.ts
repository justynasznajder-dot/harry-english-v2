import { NextRequest, NextResponse } from "next/server";

import {

  canAccessSchoolAdminApis,

  createParentUserWithEnrollmentRequests,

  DuplicateEnrollmentError,

  getAllUsers,

  getRegistrationSchoolId,

  getUserById,

  getUsersByRole,

  isAdmin,

  parseUserRole,

  queryDb,

  resolveAdminPanelTenant,

  resolveAdminUsersSchoolScope,

  UserRole,

} from "@/lib/db";

import bcrypt from "bcryptjs";

import { createUser } from "@/lib/db";

import { getTokenFromRequest } from "@/lib/auth";

const LOCATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminChildInput = {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  preferredLocationId?: string | null;
};



// GET - pobierz użytkowników z filtrami

export async function GET(request: NextRequest) {

  try {

    const payload = await getTokenFromRequest(request);

    const userId = payload?.userId;

    if (!userId) {

      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

    }



    const userCanStaff = await canAccessSchoolAdminApis(userId);

    if (!userCanStaff) {

      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    }



    const resolved = await resolveAdminPanelTenant(userId);

    if (!resolved.ok) {

      return NextResponse.json({ message: resolved.message }, { status: resolved.status });

    }

    const { tenant } = resolved;

    const schoolScope = resolveAdminUsersSchoolScope(tenant);



    const { searchParams } = new URL(request.url);

    const filterConfirmed = searchParams.get('confirmed');

    const filterRole = searchParams.get("role");



    let users;

    if (filterRole) {

      const parsed = parseUserRole(filterRole);

      if (!parsed) {

        return NextResponse.json({ message: "Nieprawidłowa rola filtra" }, { status: 400 });

      }

      users = await getUsersByRole(parsed, schoolScope);

    } else {

      users = await getAllUsers(schoolScope);

    }



    if (tenant.role === "MANAGER") {

      users = users.filter((u) => u.role !== "ADMIN");

    }



    if (filterConfirmed !== null) {

      const confirmed = filterConfirmed === 'true';

      users = users.filter(u => u.confirmed === confirmed);

    }



    const safeUsers = users.map(u => ({

      id: u.id,

      first_name: u.first_name,

      last_name: u.last_name,

      email: u.email,

      role: u.role,

      confirmed: u.confirmed,

      active: u.active,

      access_level: u.access_level,

      phone: u.phone,

      resignation_date: u.resignation_date,

      created_at: u.created_at,

      last_login: u.last_login,

    }));



    return NextResponse.json({ users: safeUsers });

  } catch (error) {

    console.error("Get users error:", error);

    return NextResponse.json(

      { message: "Wystąpił błąd podczas pobierania użytkowników" },

      { status: 500 }

    );

  }

}



// POST - dodaj nowego użytkownika

export async function POST(request: NextRequest) {

  try {

    const payload = await getTokenFromRequest(request);

    const userId = payload?.userId;

    if (!userId) {

      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

    }



    const userCanStaff = await canAccessSchoolAdminApis(userId);

    if (!userCanStaff) {

      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    }



    const actor = await getUserById(userId);

    if (!actor) {

      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });

    }



    const body = await request.json();

    const {

      email,

      password,

      firstName,

      lastName,

      role,

      confirmed,

      accessLevel,

      phone: phoneRaw,

    } = body;

    const phone =

      phoneRaw != null && String(phoneRaw).trim() !== "" ? String(phoneRaw).trim() : null;



    if (actor.role === "MANAGER") {

      const requestedSchoolIdRaw =

        body.schoolId ??

        body.school_id ??

        (typeof body.school === "object" && body.school?.id ? body.school.id : undefined);

      const requestedSchoolId =

        requestedSchoolIdRaw != null && String(requestedSchoolIdRaw).trim() !== ""

          ? String(requestedSchoolIdRaw).trim()

          : null;

      if (requestedSchoolId && requestedSchoolId !== actor.school_id) {

        return NextResponse.json(

          { message: "Manager może tworzyć użytkowników wyłącznie w swojej szkole" },

          { status: 403 }

        );

      }

    }



    if (!email || !password || !firstName || !lastName) {

      return NextResponse.json(

        { message: "Wszystkie pola są wymagane" },

        { status: 400 }

      );

    }



    const salt = await bcrypt.genSalt(10);

    const passwordHash = await bcrypt.hash(password, salt);



    let targetRole: UserRole = "PARENT";

    if (role != null && String(role).trim() !== "") {

      const p = parseUserRole(String(role));

      if (!p) {

        return NextResponse.json({ message: "Nieprawidłowa rola" }, { status: 400 });

      }

      targetRole = p;

    }



    if (targetRole === "ADMIN" && !(await isAdmin(userId))) {

      return NextResponse.json(

        { message: "Tylko super administrator (ADMIN) może tworzyć konta z rolą ADMIN" },

        { status: 403 }

      );

    }



    if (actor.role === "MANAGER" && targetRole === "ADMIN") {

      return NextResponse.json(

        { message: "Zarządca szkoły nie może tworzyć kont super administratora" },

        { status: 403 }

      );

    }



    let targetSchoolId: string | null;

    if (targetRole === "ADMIN") {

      targetSchoolId = null;

    } else if (actor.role === "MANAGER") {

      if (!actor.school_id) {

        return NextResponse.json(

          { message: "Konto zarządcy nie ma przypisanej szkoły — skontaktuj się z administratorem." },

          { status: 400 }

        );

      }

      targetSchoolId = actor.school_id;

    } else if (actor.role === "ADMIN") {

      const fromBody =

        body.schoolId ??

        body.school_id ??

        (typeof body.school === "object" && body.school?.id ? body.school.id : undefined);

      const parsed =

        fromBody != null && String(fromBody).trim() !== "" ? String(fromBody).trim() : null;

      targetSchoolId = parsed ?? getRegistrationSchoolId();

    } else {

      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });

    }



    const resolvedConfirmed =

      confirmed !== undefined ? Boolean(confirmed) : targetRole === "PARENT" ? false : true;



    if (targetRole === "PARENT") {
      const childrenRaw = (body as { children?: AdminChildInput[] }).children;
      if (!Array.isArray(childrenRaw) || childrenRaw.length === 0) {
        return NextResponse.json(
          { message: "Dodaj co najmniej jedno dziecko i uzupełnij jego dane" },
          { status: 400 }
        );
      }

      if (!targetSchoolId) {
        return NextResponse.json(
          { message: "Brak identyfikatora szkoły dla rodzica" },
          { status: 400 }
        );
      }

      const normalizedChildren: Array<{
        firstName: string;
        lastName: string;
        birthDate: string;
        preferredLocationId: string | null;
      }> = [];

      for (let i = 0; i < childrenRaw.length; i++) {
        const ch = childrenRaw[i] ?? {};
        const firstName = String(ch.firstName ?? "").trim();
        const lastName = String(ch.lastName ?? "").trim();
        const birthDate = String(ch.birthDate ?? "").slice(0, 10);
        const preferredLocationId = String(ch.preferredLocationId ?? "").trim() || null;

        if (!firstName || !lastName || !birthDate) {
          return NextResponse.json(
            { message: `Dziecko ${i + 1}: uzupełnij imię, nazwisko i datę urodzenia` },
            { status: 400 }
          );
        }

        if (preferredLocationId) {
          if (!LOCATION_ID_REGEX.test(preferredLocationId)) {
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
            [preferredLocationId, targetSchoolId]
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
          preferredLocationId,
        });
      }

      const { user: newUser, enrollmentCount } = await createParentUserWithEnrollmentRequests({
        email,
        passwordHash,
        firstName,
        lastName,
        schoolId: targetSchoolId,
        phone,
        confirmed: resolvedConfirmed,
        accessLevel: accessLevel || "PENDING",
        children: normalizedChildren,
      });

      const safeUser = {
        id: newUser.id,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        email: newUser.email,
        role: newUser.role,
        confirmed: newUser.confirmed,
        active: newUser.active,
        access_level: newUser.access_level,
        phone: newUser.phone,
        created_at: newUser.created_at,
      };

      return NextResponse.json({
        user: safeUser,
        enrollmentCount,
        message: `Utworzono konto rodzica i ${enrollmentCount} zgłoszeń`,
      });
    }

    const newUser = await createUser({

      email,

      passwordHash,

      firstName,

      lastName,

      role: targetRole,

      schoolId: targetSchoolId,

      phone,

      confirmed: resolvedConfirmed,

      accessLevel: accessLevel || "ACTIVE",

    });



    const safeUser = {

      id: newUser.id,

      first_name: newUser.first_name,

      last_name: newUser.last_name,

      email: newUser.email,

      role: newUser.role,

      confirmed: newUser.confirmed,

      active: newUser.active,

      access_level: newUser.access_level,

      phone: newUser.phone,

      created_at: newUser.created_at,

    };



    return NextResponse.json({ user: safeUser, message: "Użytkownik został utworzony" });

  } catch (error: unknown) {

    console.error("Create user error:", error);

    if (error instanceof DuplicateEnrollmentError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    const pg = error as { code?: string; message?: string; detail?: string };

    if (

      pg.code === "23505" ||

      /duplicate key|unique constraint/i.test(String(pg.message ?? ""))

    ) {

      return NextResponse.json(

        { message: "Użytkownik z tym adresem email już istnieje w tej szkole" },

        { status: 409 }

      );

    }

    if (error instanceof Error && error.message.includes("Brak identyfikatora szkoły")) {

      return NextResponse.json({ message: error.message }, { status: 400 });

    }

    return NextResponse.json(

      {

        message: "Wystąpił błąd podczas tworzenia użytkownika",

        pgCode: pg.code,

        pgMessage: pg.message,

        detail: pg.detail,

      },

      { status: 500 }

    );

  }

}

