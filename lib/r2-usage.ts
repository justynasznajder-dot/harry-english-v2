import { AsyncLocalStorage } from "async_hooks";

import { queryDb } from "@/lib/db";

/**
 * Etykiety procesów korzystających z R2 — służą do atrybucji Class A/B.
 * Dodawaj nowe wartości przy kolejnych call site’ach.
 */
export const R2_SOURCES = [
  "invoice.create",
  "invoice.corrective",
  "invoice.orphan-cleanup",
  "enrollment.sign",
  "parent.documents.list",
  "parent.documents.download",
  "parent.payments.invoice",
  "accountant.invoice.pdf",
  "script.backfill-contracts",
  "unknown",
] as const;

export type R2Source = (typeof R2_SOURCES)[number];

export type R2Op = "PUT" | "GET" | "LIST" | "DELETE";

/** Mapowanie na klasy billingowe Cloudflare R2. */
export function r2BillingClass(op: R2Op): "A" | "B" | "free" {
  if (op === "PUT" || op === "LIST") return "A";
  if (op === "GET") return "B";
  return "free";
}

type R2UsageStore = {
  source: R2Source;
};

const r2UsageAls = new AsyncLocalStorage<R2UsageStore>();

export function getR2Source(): R2Source {
  return r2UsageAls.getStore()?.source ?? "unknown";
}

/** Ustawia kontekst źródła dla wszystkich operacji R2 w `work`. */
export function runWithR2Source<T>(source: R2Source, work: () => Promise<T>): Promise<T>;
export function runWithR2Source<T>(source: R2Source, work: () => T): T;
export function runWithR2Source<T>(source: R2Source, work: () => T | Promise<T>): T | Promise<T> {
  return r2UsageAls.run({ source }, work);
}

export type R2UsageEvent = {
  type: "r2_usage";
  op: R2Op;
  billingClass: "A" | "B" | "free";
  source: R2Source;
  bucket: string;
  keyOrPrefix: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  at: string;
};

async function persistR2Usage(payload: R2UsageEvent): Promise<void> {
  await queryDb(
    `INSERT INTO r2_usage_logs (
       op, billing_class, source, bucket, key_or_prefix, ok, duration_ms, error
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      payload.op,
      payload.billingClass,
      payload.source,
      payload.bucket,
      payload.keyOrPrefix,
      payload.ok,
      payload.durationMs,
      payload.error ?? null,
    ]
  );
}

/**
 * Strukturalny log (Vercel) + best-effort zapis do `r2_usage_logs`.
 * Insert nie blokuje ścieżki R2 — błąd tabeli/DB tylko w warn.
 */
export function recordR2Usage(event: Omit<R2UsageEvent, "type" | "billingClass" | "source" | "at"> & {
  source?: R2Source;
}): void {
  const payload: R2UsageEvent = {
    type: "r2_usage",
    billingClass: r2BillingClass(event.op),
    source: event.source ?? getR2Source(),
    at: new Date().toISOString(),
    op: event.op,
    bucket: event.bucket,
    keyOrPrefix: event.keyOrPrefix,
    ok: event.ok,
    durationMs: event.durationMs,
    ...(event.error ? { error: event.error } : {}),
  };
  console.info(`[R2_USAGE] ${JSON.stringify(payload)}`);
  void persistR2Usage(payload).catch((err) => {
    console.warn("[R2_USAGE] persist failed:", err instanceof Error ? err.message : err);
  });
}
