/**
 * Nagłówki Content-Disposition z polskimi znakami w `filename="…"`
 * wywalają Node (`ByteString` > 255). ASCII fallback + RFC 5987 `filename*`.
 */

function asciiFilenameFallback(filename: string): string {
  const ascii = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return ascii || "download.pdf";
}

/** Wartość nagłówka `Content-Disposition` dla załącznika. */
export function buildAttachmentContentDisposition(filename: string): string {
  const safeName = filename.trim() || "download.pdf";
  const fallback = asciiFilenameFallback(safeName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

/** Preferuje `filename*` (UTF-8), potem zwykłe `filename="…"`. */
export function parseContentDispositionFilename(header: string): string | null {
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g, "").trim());
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  return bare?.[1]?.trim().replace(/^"|"$/g, "") || null;
}
