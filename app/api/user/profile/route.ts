import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { getParentProfileByUserId, getUserById, upsertParentProfileForUser } from "@/lib/db";

function normalizeZip(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

export async function GET(_request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(_request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ message: "Użytkownik nie istnieje" }, { status: 404 });
    }
    if (user.role !== "PARENT") {
      return NextResponse.json(
        { message: "Profil rodzica jest dostępny tylko dla konta rodzica" },
        { status: 403 }
      );
    }
    if (!user.school_id) {
      return NextResponse.json(
        { message: "Konto nie ma przypisanej szkoły" },
        { status: 400 }
      );
    }

    const profile = await getParentProfileByUserId(userId);

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
    console.error("GET /api/user/profile:", error);
    return NextResponse.json({ message: "Błąd pobierania profilu" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ message: "Użytkownik nie istnieje" }, { status: 404 });
    }
    if (user.role !== "PARENT") {
      return NextResponse.json(
        { message: "Profil rodzica jest dostępny tylko dla konta rodzica" },
        { status: 403 }
      );
    }
    if (!user.school_id) {
      return NextResponse.json(
        { message: "Konto nie ma przypisanej szkoły" },
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
    const zipRaw =
      body.zipCode !== undefined ? body.zipCode : body.zip_code !== undefined ? body.zip_code : undefined;
    const zip_code = zipRaw !== undefined ? normalizeZip(zipRaw) : undefined;

    if (address === undefined && city === undefined && zip_code === undefined) {
      return NextResponse.json({ message: "Brak pól do aktualizacji" }, { status: 400 });
    }

    const existing = await getParentProfileByUserId(userId);
    const profile = await upsertParentProfileForUser({
      userId,
      schoolId: user.school_id,
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
    console.error("PUT /api/user/profile:", error);
    return NextResponse.json({ message: "Błąd zapisu profilu" }, { status: 500 });
  }
}
