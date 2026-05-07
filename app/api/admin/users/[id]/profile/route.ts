import { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/db";
import {
  canAccessSchoolAdminApis,
  getParentProfileByUserId,
  getUserById,
  upsertParentProfileForUser,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

function managerSchoolScopeError(actor: User, target: User | null): NextResponse | null {
  if (actor.role !== "MANAGER") return null;
  if (!actor.school_id) {
    return NextResponse.json(
      { message: "Konto zarządcy nie ma przypisanej szkoły." },
      { status: 400 }
    );
  }
  if (!target) {
    return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
  }
  if (target.role === "ADMIN" || target.school_id == null) {
    return NextResponse.json({ message: "Brak uprawnień do tego użytkownika" }, { status: 403 });
  }
  if (target.school_id !== actor.school_id) {
    return NextResponse.json(
      { message: "Możesz zarządzać tylko użytkownikami ze swojej szkoły" },
      { status: 403 }
    );
  }
  return null;
}

function normalizeZip(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getTokenFromRequest(_request);
    const actorId = payload?.userId;
    if (!actorId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const canStaff = await canAccessSchoolAdminApis(actorId);
    if (!canStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const actor = await getUserById(actorId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const { id: targetUserId } = await params;
    const target = await getUserById(targetUserId);
    const scopeErr = managerSchoolScopeError(actor, target);
    if (scopeErr) return scopeErr;

    if (!target) {
      return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
    }
    if (target.role !== "PARENT") {
      return NextResponse.json(
        { message: "Profil rozszerzony dotyczy tylko kont z rolą PARENT" },
        { status: 400 }
      );
    }

    const profile = await getParentProfileByUserId(targetUserId);

    return NextResponse.json({
      profile: profile
        ? {
            id: profile.id,
            userId: profile.user_id,
            schoolId: profile.school_id,
            address: profile.address,
            city: profile.city,
            zipCode: profile.zip_code,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/admin/users/[id]/profile:", error);
    return NextResponse.json({ message: "Błąd pobierania profilu" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getTokenFromRequest(request);
    const actorId = payload?.userId;
    if (!actorId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const canStaff = await canAccessSchoolAdminApis(actorId);
    if (!canStaff) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const actor = await getUserById(actorId);
    if (!actor) {
      return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });
    }

    const { id: targetUserId } = await params;
    const target = await getUserById(targetUserId);
    const scopeErr = managerSchoolScopeError(actor, target);
    if (scopeErr) return scopeErr;

    if (!target) {
      return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
    }
    if (target.role !== "PARENT") {
      return NextResponse.json(
        { message: "Profil rozszerzony dotyczy tylko kont z rolą PARENT" },
        { status: 400 }
      );
    }
    if (!target.school_id) {
      return NextResponse.json(
        { message: "Konto rodzica nie ma przypisanej szkoły" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const address =
      body.address !== undefined
        ? body.address == null || String(body.address).trim() === ""
          ? null
          : String(body.address).trim()
        : undefined;
    const city =
      body.city !== undefined
        ? body.city == null || String(body.city).trim() === ""
          ? null
          : String(body.city).trim()
        : undefined;
    let zipFromBody: unknown;
    if (body.zipCode !== undefined) zipFromBody = body.zipCode;
    else if (body.zip_code !== undefined) zipFromBody = body.zip_code;
    const zip_code = zipFromBody !== undefined ? normalizeZip(zipFromBody) : undefined;

    if (address === undefined && city === undefined && zip_code === undefined) {
      return NextResponse.json({ message: "Brak pól do aktualizacji" }, { status: 400 });
    }

    const existing = await getParentProfileByUserId(targetUserId);
    const profile = await upsertParentProfileForUser({
      userId: targetUserId,
      schoolId: target.school_id,
      address: address !== undefined ? address : existing?.address ?? null,
      city: city !== undefined ? city : existing?.city ?? null,
      zip_code: zip_code !== undefined ? zip_code : existing?.zip_code ?? null,
    });

    if (!profile) {
      return NextResponse.json({ message: "Nie udało się zapisać profilu" }, { status: 500 });
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        userId: profile.user_id,
        schoolId: profile.school_id,
        address: profile.address,
        city: profile.city,
        zipCode: profile.zip_code,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    console.error("PUT /api/admin/users/[id]/profile:", error);
    return NextResponse.json({ message: "Błąd zapisu profilu" }, { status: 500 });
  }
}
