/** Numer dowodu PL: `ABC 123456` (spacja między serią liter a cyframi). */
export function formatIdCardNumber(raw: string): string {
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 32);
  if (!alnum) return "";

  const classic = alnum.match(/^([A-Z]{1,3})(\d{1,6})$/);
  if (classic) return `${classic[1]} ${classic[2]}`;

  const general = alnum.match(/^([A-Z]+)(\d+)$/);
  if (general) return `${general[1]} ${general[2]}`;

  return alnum;
}
