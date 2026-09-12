import { NextRequest, NextResponse } from "next/server";

import {
  getAllUsers,
  getRegistrationSchoolId,
  getUserById,
  getUsersByRole,
  isAdmin,
  parseUserRole,
  queryDb,
  resolveAdminUsersSchoolScope,
  UserRole,
} from "@/lib/db";

import bcrypt from "bcryptjs";

import { createUser } from "@/lib/db";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { formatIdCardNumber } from "@/lib/format-id-card-number";



// GET - pobierz użytkowników z filtrami

export async function GET(request: NextRequest) {

  try {

    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const schoolScope = resolveAdminUsersSchoolScope(ctx.tenant);



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



    if (ctx.tenant.role === "MANAGER") {

      users = users.filter((u) => u.role !== "ADMIN");

    }



    if (filterConfirmed !== null) {
      const confirmed = filterConfirmed === "true";
      users = users.filter((u) => u.confirmed === confirmed);
    }

    const parentIds = users.filter((u) => u.role === "PARENT").map((u) => u.id);
    const childrenCountByParent = new Map<string, number>();
    const siblingDiscountByParent = new Map<string, boolean>();
    if (parentIds.length > 0 && schoolScope) {
      const counts = await queryDb<{ parent_id: string; cnt: number }>(
        `SELECT parent_id, COUNT(*)::int AS cnt
         FROM children
         WHERE school_id = $1
           AND parent_id = ANY($2::text[])
           AND active = TRUE
         GROUP BY parent_id`,
        [schoolScope, parentIds]
      );
      for (const row of counts.rows) {
        childrenCountByParent.set(row.parent_id, row.cnt);
      }

      const siblingFromEnrollment = await queryDb<{
        parent_id: string;
        declared: boolean;
      }>(
        `SELECT user_id AS parent_id,
                COALESCE(BOOL_OR(enrolling_multiple_children), FALSE) AS declared
         FROM enrollment_requests
         WHERE school_id = $1
           AND user_id = ANY($2::text[])
           AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'
         GROUP BY user_id`,
        [schoolScope, parentIds]
      );
      for (const row of siblingFromEnrollment.rows) {
        if (row.declared) siblingDiscountByParent.set(row.parent_id, true);
      }

      const siblingFromContracts = await queryDb<{
        parent_id: string;
        declared: boolean;
      }>(
        `SELECT parent_id,
                COALESCE(BOOL_OR(discount_sibling), FALSE) AS declared
         FROM contracts
         WHERE school_id = $1
           AND parent_id = ANY($2::text[])
           AND UPPER(BTRIM(COALESCE(status::text, ''))) IN ('SENT', 'SIGNED')
         GROUP BY parent_id`,
        [schoolScope, parentIds]
      );
      for (const row of siblingFromContracts.rows) {
        if (row.declared) siblingDiscountByParent.set(row.parent_id, true);
      }
    }

    const safeUsers = users.map((u) => ({
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      role: u.role,
      confirmed: u.confirmed,
      active: u.active,
      access_level: u.access_level,
      phone: u.phone,
      client_number: u.client_number,
      resignation_date: u.resignation_date,
      created_at: u.created_at,
      last_login: u.last_login,
      children_count:
        u.role === "PARENT" ? (childrenCountByParent.get(u.id) ?? 0) : null,
      sibling_discount:
        u.role === "PARENT"
          ? (siblingDiscountByParent.get(u.id) ?? false)
          : null,
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

    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);

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

      pesel: peselRaw,

      id_card_number: idCardRaw,

      idCardNumber: idCardCamelRaw,

    } = body;

    const phone =

      phoneRaw != null && String(phoneRaw).trim() !== "" ? String(phoneRaw).trim() : null;

    let pesel: string | null = null;

    if (peselRaw != null && String(peselRaw).trim() !== "") {

      const digits = String(peselRaw).replace(/\D/g, "").slice(0, 11);

      if (digits.length !== 11) {

        return NextResponse.json({ message: "PESEL musi mieć 11 cyfr" }, { status: 400 });

      }

      pesel = digits;

    }

    const idCardInput = idCardRaw ?? idCardCamelRaw;

    let idCardNumber: string | null = null;

    if (idCardInput != null && String(idCardInput).trim() !== "") {

      const formatted = formatIdCardNumber(String(idCardInput));

      idCardNumber = formatted === "" ? null : formatted;

    }



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



    if (targetRole === "ADMIN" && !(await isAdmin(ctx.userId))) {

      return NextResponse.json(

        { message: "Tylko super administrator (ADMIN) może tworzyć konta z rolą ADMIN" },

        { status: 403 }

      );

    }

    if (targetRole === "PARENT") {
      return NextResponse.json(
        {
          message:
            "Kont rodziców nie tworzy się z panelu — rodzic rejestruje się samodzielnie przy zapisie dziecka",
        },
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
      confirmed !== undefined ? Boolean(confirmed) : true;

    const newUser = await createUser({

      email,

      passwordHash,

      firstName,

      lastName,

      role: targetRole,

      schoolId: targetSchoolId,

      phone,

      pesel,

      id_card_number: idCardNumber,

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

