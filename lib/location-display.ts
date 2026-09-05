/** Składa synchroniczną kolumnę `locations.name` (bez „(Nowość!)”). */
export function buildLocationStoredName(input: {
  isSpecial: boolean;
  town?: string | null;
  facility?: string | null;
  specialName?: string | null;
}): string {
  if (input.isSpecial) {
    return String(input.specialName ?? "").trim();
  }
  const town = String(input.town ?? "").trim();
  const facility = String(input.facility ?? "").trim();
  return [town, facility].filter(Boolean).join(" ").trim();
}

/** Etykieta na formularzu zgłoszeniowym / selectach: ★ + nazwa + (Nowość!). */
export function formatLocationOptionLabel(loc: {
  name: string;
  is_featured?: boolean | null;
  is_new?: boolean | null;
}): string {
  const base = String(loc.name ?? "").trim();
  const withNew = loc.is_new ? `${base} (Nowość!)` : base;
  return loc.is_featured ? `★ ${withNew}` : withNew;
}
