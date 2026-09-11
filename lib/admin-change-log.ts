import { randomUUID } from "crypto";
import { queryDb } from "@/lib/db";

export const ADMIN_CHANGE_ENTITY_TYPES = ["parent", "child"] as const;
export type AdminChangeEntityType = (typeof ADMIN_CHANGE_ENTITY_TYPES)[number];

export const ADMIN_CHANGE_ACTIONS = [
  "ACCOUNT_UPDATE",
  "PROFILE_UPDATE",
  "DEACTIVATE",
  "RESTORE",
  "PRICES_UPDATE",
] as const;
export type AdminChangeAction = (typeof ADMIN_CHANGE_ACTIONS)[number];

export type WriteAdminChangeLogInput = {
  schoolId: string;
  actorUserId?: string | null;
  entityType: AdminChangeEntityType;
  entityId: string;
  action: AdminChangeAction;
  summary: string;
  payload: Record<string, unknown>;
};

export type FieldDiff = {
  fields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

function normalizeComparable(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const na = normalizeComparable(a);
  const nb = normalizeComparable(b);
  if (na === nb) return true;
  if (na == null && nb == null) return true;
  return String(na) === String(nb);
}

/** Porównuje wskazane pola — zwraca tylko różnice. */
export function diffTrackedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): FieldDiff | null {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const fields: string[] = [];

  for (const key of keys) {
    if (!(key in after) && !(key in before)) continue;
    const b = key in before ? before[key] : null;
    const a = key in after ? after[key] : null;
    if (valuesEqual(b, a)) continue;
    fields.push(key);
    changedBefore[key] = normalizeComparable(b);
    changedAfter[key] = normalizeComparable(a);
  }

  if (fields.length === 0) return null;
  return { fields, before: changedBefore, after: changedAfter };
}

/**
 * Best-effort audit log przy zmianach kont rodziców / dzieci.
 * Błąd zapisu nie przerywa operacji — tylko log w konsoli.
 */
export async function writeAdminChangeLog(
  input: WriteAdminChangeLogInput,
): Promise<void> {
  try {
    await queryDb(
      `INSERT INTO admin_change_logs (
         id, school_id, actor_user_id, entity_type, entity_id,
         action, summary, payload, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
      [
        randomUUID(),
        input.schoolId,
        input.actorUserId ?? null,
        input.entityType,
        input.entityId,
        input.action,
        input.summary,
        JSON.stringify(input.payload ?? {}),
      ],
    );
  } catch (error) {
    console.error("writeAdminChangeLog failed:", error);
  }
}
