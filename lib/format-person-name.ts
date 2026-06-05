const LOCALE = "pl-PL";

function capitalizeSegment(part: string): string {
  if (!part) return part;
  const lower = part.toLocaleLowerCase(LOCALE);
  return lower.charAt(0).toLocaleUpperCase(LOCALE) + lower.slice(1);
}

/** Imię/nazwisko: pierwsza litera wielka, reszta mała; osobno każde słowo i segment po myślniku. */
export function formatPersonName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  return trimmed
    .split(/(\s+|-)/)
    .map((token) =>
      token === "-" || /^\s+$/.test(token) ? token : capitalizeSegment(token)
    )
    .join("");
}
