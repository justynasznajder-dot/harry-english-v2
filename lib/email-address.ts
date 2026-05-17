const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** Parsuje listę adresów z tekstu (przecinki, średniki, spacje, nowe linie). */
export function parseEmailList(raw: string): string[] {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (!EMAIL_ADDRESS_RE.test(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function isValidEmailAddress(email: string): boolean {
  return EMAIL_ADDRESS_RE.test(email.trim());
}
