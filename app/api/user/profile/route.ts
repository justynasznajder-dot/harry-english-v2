import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import {
  getParentProfileByUserId,
  getUserById,
  parentHasGeneratedContract,
  updateUser,
  upsertParentProfileForUser,
} from "@/lib/db";
import { formatPersonName } from "@/lib/format-person-name";
import { normalizePolishPhone } from "@/lib/phone";
import {
  isParentContractProfileComplete,
  resolveBillingTypeFromProfile,
  validateParentContractProfileInput,
  type BillingType,
} from "@/lib/parent-contract-profile";

function normalizeZip(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

function profileToJson(profile: NonNullable<Awaited<ReturnType<typeof getParentProfileByUserId>>>) {
  const billingType = resolveBillingTypeFromProfile(profile);
  return {
    id: profile.id,
    userId: profile.user_id,
    schoolId: profile.school_id,
    address: profile.address,
    city: profile.city,
    zipCode: profile.zip_code,
    billingType,
    companyName: profile.company_name,
    nip: profile.nip,
    pesel: profile.pesel,
    discountLargeFamily: profile.discount_large_family === true,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    complete: isParentContractProfileComplete(profile),
  };
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
    const profileLocked = await parentHasGeneratedContract(userId);

    return NextResponse.json({
      profile: profile ? profileToJson(profile) : null,
      profileLocked,
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        clientNumber: user.client_number,
      },
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

    // Podpisane umowy mają zamrożoną treść — zmiana profilu dotyczy przyszłych dokumentów/faktur.
    const body = await request.json();
    const billingType = String(body.billingType ?? body.billing_type ?? "private")
      .trim()
      .toLowerCase() as BillingType;
    if (billingType !== "private" && billingType !== "company") {
      return NextResponse.json({ message: "Nieprawidłowy typ rozliczenia" }, { status: 400 });
    }

    const firstName = String(body.firstName ?? body.first_name ?? user.first_name).trim();
    const lastName = String(body.lastName ?? body.last_name ?? user.last_name).trim();
    if (!firstName || !lastName) {
      return NextResponse.json(
        { message: "Imię i nazwisko rodzica są wymagane" },
        { status: 400 }
      );
    }

    const phoneRaw = body.phone !== undefined ? String(body.phone ?? "").trim() : user.phone;
    const phone =
      phoneRaw && phoneRaw.length > 0 ? normalizePolishPhone(phoneRaw) : null;

    const address = String(body.address ?? "").trim();
    const city = String(body.city ?? "").trim();
    const zipCode = normalizeZip(body.zipCode ?? body.zip_code) ?? "";
    const pesel = String(body.pesel ?? "").trim();
    const companyName = String(body.companyName ?? body.company_name ?? "").trim();
    const nip = String(body.nip ?? "").trim();
    const discountLargeFamilyRaw =
      body.discountLargeFamily ?? body.discount_large_family;
    const discountLargeFamily =
      discountLargeFamilyRaw === undefined
        ? undefined
        : discountLargeFamilyRaw === true ||
          discountLargeFamilyRaw === "true" ||
          discountLargeFamilyRaw === 1 ||
          discountLargeFamilyRaw === "1";

    const validationError = validateParentContractProfileInput({
      billingType,
      address,
      city,
      zipCode,
      pesel,
      companyName,
      nip,
    });
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    await updateUser(userId, {
      first_name: formatPersonName(firstName),
      last_name: formatPersonName(lastName),
      phone,
    });

    const profile = await upsertParentProfileForUser({
      userId,
      schoolId: user.school_id,
      address,
      city,
      zip_code: zipCode,
      company_name: billingType === "company" ? companyName : null,
      nip: billingType === "company" ? nip : null,
      pesel: billingType === "company" ? null : pesel,
      ...(discountLargeFamily !== undefined
        ? { discount_large_family: discountLargeFamily }
        : {}),
    });

    if (!profile) {
      return NextResponse.json({ message: "Nie udało się zapisać profilu" }, { status: 500 });
    }

    return NextResponse.json({
      profile: profileToJson(profile),
      profileLocked: await parentHasGeneratedContract(userId),
      user: {
        firstName: formatPersonName(firstName),
        lastName: formatPersonName(lastName),
        phone,
      },
    });
  } catch (error) {
    console.error("PUT /api/user/profile:", error);
    return NextResponse.json({ message: "Błąd zapisu profilu" }, { status: 500 });
  }
}
