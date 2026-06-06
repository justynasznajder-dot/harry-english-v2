import { NextRequest, NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  resolveAdminPanelTenant,
  resolveAdminUsersSchoolScope,
  type ResolvedAdminPanelTenant,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import {
  ALL_DISCOUNT_KEYS,
  DISCOUNT_LABELS,
  addComplimentaryParent,
  getSchoolDiscountSettings,
  listComplimentaryCandidates,
  listComplimentaryParents,
  parseDiscountPercent,
  removeComplimentaryParent,
  upsertSchoolDiscountSettings,
  type DiscountKey,
} from "@/lib/school-discounts";

async function ensureAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

function resolveSchoolIdForTenant(
  tenant: ResolvedAdminPanelTenant,
  bodySchoolId?: string | null
): string | null {
  if (tenant.role === "MANAGER") {
    const fromBody = String(bodySchoolId ?? "").trim();
    if (fromBody && fromBody !== tenant.tenantSchoolId) return null;
    return tenant.tenantSchoolId;
  }
  return resolveAdminUsersSchoolScope(tenant) || null;
}

export async function GET(request: NextRequest) {
  const adminId = await ensureAdmin(request);
  if (!adminId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

  const resolved = await resolveAdminPanelTenant(adminId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;

  const schoolId = resolveSchoolIdForTenant(tenant);
  if (!schoolId) {
    return NextResponse.json({ message: "Brak identyfikatora szkoły" }, { status: 400 });
  }

  try {
    const [settings, complimentaryParents, complimentaryCandidates] = await Promise.all([
      getSchoolDiscountSettings(schoolId),
      listComplimentaryParents(schoolId),
      listComplimentaryCandidates(schoolId),
    ]);

    return NextResponse.json({
      discounts: ALL_DISCOUNT_KEYS.map((key) => ({
        key,
        label: DISCOUNT_LABELS[key],
        percent: settings[key],
      })),
      complimentaryParents,
      complimentaryCandidates,
      availableParents: complimentaryCandidates
        .filter((c) => c.source === "USER")
        .map((c) => ({
          id: c.parentId!,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
        })),
    });
  } catch (error) {
    console.error("GET /api/admin/discounts:", error);
    return NextResponse.json({ message: "Błąd pobierania ustawień zniżek" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const adminId = await ensureAdmin(request);
  if (!adminId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

  const resolved = await resolveAdminPanelTenant(adminId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;

  try {
    const body = await request.json();
    const schoolId = resolveSchoolIdForTenant(
      tenant,
      (body?.schoolId as string | undefined) ?? (body?.school_id as string | undefined)
    );
    if (!schoolId) {
      return NextResponse.json(
        { message: "Manager może edytować zniżki tylko dla swojej szkoły" },
        { status: 403 }
      );
    }

    const patch: Partial<Record<DiscountKey, number>> = {};
    const discountsInput = body?.discounts;
    if (Array.isArray(discountsInput)) {
      for (const item of discountsInput) {
        const key = String(item?.key ?? "").trim().toUpperCase() as DiscountKey;
        if ((ALL_DISCOUNT_KEYS as readonly string[]).includes(key)) {
          patch[key] = parseDiscountPercent(item?.percent);
        }
      }
    } else if (discountsInput && typeof discountsInput === "object") {
      for (const key of ALL_DISCOUNT_KEYS) {
        if (discountsInput[key] != null) {
          patch[key] = parseDiscountPercent(discountsInput[key]);
        }
      }
    }

    const settings = await upsertSchoolDiscountSettings(schoolId, patch);

    return NextResponse.json({
      message: "Ustawienia zniżek zostały zapisane",
      discounts: ALL_DISCOUNT_KEYS.map((key) => ({
        key,
        label: DISCOUNT_LABELS[key],
        percent: settings[key],
      })),
    });
  } catch (error) {
    console.error("PUT /api/admin/discounts:", error);
    return NextResponse.json({ message: "Błąd zapisu ustawień zniżek" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminId = await ensureAdmin(request);
  if (!adminId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

  const resolved = await resolveAdminPanelTenant(adminId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;

  try {
    const body = await request.json();
    const schoolId = resolveSchoolIdForTenant(
      tenant,
      (body?.schoolId as string | undefined) ?? (body?.school_id as string | undefined)
    );
    const parentId = String(body?.parentId ?? body?.parent_id ?? "").trim();
    const parentEmail = String(body?.parentEmail ?? body?.parent_email ?? "").trim();
    const candidateKey = String(body?.candidateKey ?? body?.candidate_key ?? "").trim();

    if (!schoolId) {
      return NextResponse.json({ message: "Brak identyfikatora szkoły" }, { status: 400 });
    }

    if (candidateKey.startsWith("user:")) {
      await addComplimentaryParent(schoolId, {
        parentId: candidateKey.slice("user:".length),
      });
    } else if (candidateKey.startsWith("enrollment:")) {
      await addComplimentaryParent(schoolId, {
        parentEmail: candidateKey.slice("enrollment:".length),
      });
    } else if (parentId) {
      await addComplimentaryParent(schoolId, { parentId });
    } else if (parentEmail) {
      await addComplimentaryParent(schoolId, { parentEmail });
    } else {
      return NextResponse.json({ message: "Wybierz rodzica" }, { status: 400 });
    }

    const complimentaryParents = await listComplimentaryParents(schoolId);

    return NextResponse.json({
      message: "Rodzic dodany do trybu bez opłat",
      complimentaryParents,
    });
  } catch (error) {
    console.error("POST /api/admin/discounts:", error);
    const message =
      error instanceof Error ? error.message : "Błąd dodawania rodzica do listy";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const adminId = await ensureAdmin(request);
  if (!adminId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

  const resolved = await resolveAdminPanelTenant(adminId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;

  try {
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const schoolId = resolveSchoolIdForTenant(
      tenant,
      (body?.schoolId as string | undefined) ??
        (body?.school_id as string | undefined) ??
        url.searchParams.get("schoolId")
    );
    const id = String(body?.id ?? url.searchParams.get("id") ?? "").trim();
    const parentId = String(
      body?.parentId ?? body?.parent_id ?? url.searchParams.get("parentId") ?? ""
    ).trim();
    const parentEmail = String(
      body?.parentEmail ?? body?.parent_email ?? url.searchParams.get("parentEmail") ?? ""
    ).trim();

    if (!schoolId || (!id && !parentId && !parentEmail)) {
      return NextResponse.json({ message: "Brak wymaganych danych" }, { status: 400 });
    }

    await removeComplimentaryParent(schoolId, { id, parentId, parentEmail });
    const complimentaryParents = await listComplimentaryParents(schoolId);

    return NextResponse.json({
      message: "Rodzic usunięty z trybu bez opłat",
      complimentaryParents,
    });
  } catch (error) {
    console.error("DELETE /api/admin/discounts:", error);
    return NextResponse.json({ message: "Błąd usuwania rodzica z listy" }, { status: 500 });
  }
}
