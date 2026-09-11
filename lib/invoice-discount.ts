/** Rabat managera na fakturze: 0–100%. */
export function clampInvoiceDiscountPercent(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").trim().replace(",", ".").replace(/%/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function formatInvoiceDiscountLabel(percent: number): string {
  const p = clampInvoiceDiscountPercent(percent);
  if (p <= 0) return "0 %";
  const text = Number.isInteger(p) ? String(p) : String(p).replace(".", ",");
  return `${text} %`;
}

/** Kwota po rabacie % (zaokrąglenie do groszy). */
export function applyInvoiceDiscountPercent(amount: number, percent: unknown): number {
  const base = Number(amount);
  if (!Number.isFinite(base)) return 0;
  const p = clampInvoiceDiscountPercent(percent);
  if (p <= 0) return Math.round(base * 100) / 100;
  return Math.round(base * (1 - p / 100) * 100) / 100;
}

export function parseDiscountsByContractId(
  raw: unknown
): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(key ?? "").trim();
    if (!id) continue;
    const pct = clampInvoiceDiscountPercent(value);
    if (pct > 0) out[id] = pct;
  }
  return Object.keys(out).length > 0 ? out : null;
}
