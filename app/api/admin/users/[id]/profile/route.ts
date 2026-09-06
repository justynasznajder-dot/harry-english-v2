import { NextRequest, NextResponse } from "next/server";
import {
  getParentProfileByUserId,
  getUserById,
  upsertParentProfileForUser,
} from "@/lib/db";
import {
  managerSchoolScopeError,
  requireAdminSchoolContext,
} from "@/lib/admin-school-context";

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
    const ctx = await requireAdminSchoolContext(_request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);
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
            companyName: profile.company_name,
            nip: profile.nip,
            billingType:
              profile.company_name || profile.nip ? "company" : "private",
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
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const actor = await getUserById(ctx.userId);
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

    const companyName =
      body.companyName !== undefined || body.company_name !== undefined
        ? (() => {
            const raw = body.companyName ?? body.company_name;
            if (raw == null || String(raw).trim() === "") return null;
            return String(raw).trim();
          })()
        : undefined;
    const nip =
      body.nip !== undefined
        ? body.nip == null || String(body.nip).trim() === ""
          ? null
          : String(body.nip).trim()
        : undefined;
    const billingTypeRaw = String(body.billingType ?? body.billing_type ?? "").trim();
    const billingType =
      billingTypeRaw === "company" || billingTypeRaw === "private"
        ? billingTypeRaw
        : undefined;

    if (
      address === undefined &&
      city === undefined &&
      zip_code === undefined &&
      companyName === undefined &&
      nip === undefined &&
      billingType === undefined
    ) {
      return NextResponse.json({ message: "Brak pól do aktualizacji" }, { status: 400 });
    }

    const existing = await getParentProfileByUserId(targetUserId);
    const resolvedBilling =
      billingType ??
      (existing?.company_name || existing?.nip ? "company" : "private");
    const profile = await upsertParentProfileForUser({
      userId: targetUserId,
      schoolId: target.school_id,
      address: address !== undefined ? address : existing?.address ?? null,
      city: city !== undefined ? city : existing?.city ?? null,
      zip_code: zip_code !== undefined ? zip_code : existing?.zip_code ?? null,
      company_name:
        resolvedBilling === "company"
          ? companyName !== undefined
            ? companyName
            : existing?.company_name ?? null
          : null,
      nip:
        resolvedBilling === "company"
          ? nip !== undefined
            ? nip
            : existing?.nip ?? null
          : null,
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
        companyName: profile.company_name,
        nip: profile.nip,
        billingType:
          profile.company_name || profile.nip ? "company" : "private",
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    console.error("PUT /api/admin/users/[id]/profile:", error);
    return NextResponse.json({ message: "Błąd zapisu profilu" }, { status: 500 });
  }
}
