import type { PoolClient } from "pg";

export function formatParentClientNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99999) {
    throw new Error(`Nieprawidłowy numer klienta: ${n}`);
  }
  return String(n).padStart(5, "0");
}

export function formatChildClientNumber(
  parentClientNumber: string,
  childSeq: number
): string {
  if (!/^\d{5}$/.test(parentClientNumber)) {
    throw new Error(`Nieprawidłowy numer rodzica: ${parentClientNumber}`);
  }
  if (!Number.isInteger(childSeq) || childSeq < 1) {
    throw new Error(`Nieprawidłowy numer dziecka: ${childSeq}`);
  }
  return `${parentClientNumber}/${childSeq}`;
}

/** Umowa bazowa: ChildID/rok lub ChildID/rok/n (n>=2). */
export function buildBaseContractNumber(params: {
  childClientNumber: string;
  year: number;
  baseIndex: number;
}): string {
  const { childClientNumber, year, baseIndex } = params;
  if (!/^\d{5}\/\d+$/.test(childClientNumber)) {
    throw new Error(`Nieprawidłowy ID dziecka: ${childClientNumber}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Nieprawidłowy rok umowy: ${year}`);
  }
  if (!Number.isInteger(baseIndex) || baseIndex < 1) {
    throw new Error(`Nieprawidłowy indeks umowy: ${baseIndex}`);
  }
  if (baseIndex === 1) return `${childClientNumber}/${year}`;
  return `${childClientNumber}/${year}/${baseIndex}`;
}

/** Aneks: {baseContractNumber}/A{n} */
export function buildAnnexContractNumber(
  baseContractNumber: string,
  annexIndex: number
): string {
  if (!Number.isInteger(annexIndex) || annexIndex < 1) {
    throw new Error(`Nieprawidłowy indeks aneksu: ${annexIndex}`);
  }
  if (/\/A\d+$/i.test(baseContractNumber)) {
    throw new Error("Nie można aneksować aneksu — podaj numer umowy bazowej");
  }
  return `${baseContractNumber}/A${annexIndex}`;
}

/** Faktura sprzedaży: ParentID/miesiąc/rok/n (miesiąc bez zera wiodącego). */
export function buildSaleInvoiceNumber(params: {
  parentClientNumber: string;
  month: number;
  year: number;
  sequence: number;
}): string {
  const { parentClientNumber, month, year, sequence } = params;
  if (!/^\d{5}$/.test(parentClientNumber)) {
    throw new Error(`Nieprawidłowy numer rodzica: ${parentClientNumber}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Nieprawidłowy miesiąc: ${month}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Nieprawidłowy rok faktury: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Nieprawidłowy numer kolejny faktury: ${sequence}`);
  }
  return `${parentClientNumber}/${month}/${year}/${sequence}`;
}

/** Korekta: {originalInvoiceNumber}/K{n} */
export function buildCorrectiveInvoiceNumber(
  originalInvoiceNumber: string,
  correctionIndex: number
): string {
  if (!Number.isInteger(correctionIndex) || correctionIndex < 1) {
    throw new Error(`Nieprawidłowy indeks korekty: ${correctionIndex}`);
  }
  if (/\/K\d+$/i.test(originalInvoiceNumber)) {
    throw new Error("Nie można korygować korekty — podaj numer faktury sprzedaży");
  }
  return `${originalInvoiceNumber}/K${correctionIndex}`;
}

/** Czy numer to aneks (kończy się /A\d+). */
export function isAnnexContractNumber(contractNumber: string): boolean {
  return /\/A\d+$/i.test(contractNumber.trim());
}

/**
 * Indeks umowy bazowej w roku dla danego ChildID.
 * `00001/1/2026` → 1, `00001/1/2026/2` → 2, aneks → null.
 */
export function parseBaseContractIndex(
  contractNumber: string,
  childClientNumber: string,
  year: number
): number | null {
  const raw = contractNumber.trim();
  if (isAnnexContractNumber(raw)) return null;
  const prefix = `${childClientNumber}/${year}`;
  if (raw === prefix) return 1;
  const m = raw.match(
    new RegExp(
      `^${escapeRegExp(childClientNumber)}/${year}/(\\d+)$`
    )
  );
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 2 ? n : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Queryable = Pick<PoolClient, "query">;

export async function allocateParentClientNumber(
  client: Queryable,
  schoolId: string
): Promise<string> {
  // Blokada per szkoła — unikamy wyścigów przy równoległej rejestracji.
  await client.query(
    `INSERT INTO client_number_counters (school_id, last_number, updated_at)
     VALUES ($1, 0, NOW())
     ON CONFLICT (school_id)
     DO UPDATE SET updated_at = NOW()`,
    [schoolId]
  );
  await client.query(
    `SELECT school_id FROM client_number_counters WHERE school_id = $1 FOR UPDATE`,
    [schoolId]
  );

  // Najniższy wolny numer (luka po hard-delete, albo max+1).
  const free = await client.query<{ next_n: number }>(
    `WITH used AS (
       SELECT (client_number)::int AS n
       FROM users
       WHERE school_id = $1
         AND role = 'PARENT'
         AND client_number ~ '^[0-9]{5}$'
     ),
     candidates AS (
       SELECT generate_series(
         1,
         GREATEST(COALESCE((SELECT MAX(n) FROM used), 0) + 1, 1)
       ) AS n
     )
     SELECT c.n AS next_n
     FROM candidates c
     LEFT JOIN used u ON u.n = c.n
     WHERE u.n IS NULL
     ORDER BY c.n ASC
     LIMIT 1`,
    [schoolId]
  );
  const n = free.rows[0]?.next_n;
  if (n == null) throw new Error("Nie udało się przydzielić numeru klienta");

  await client.query(
    `UPDATE client_number_counters
     SET last_number = GREATEST(last_number, $2), updated_at = NOW()
     WHERE school_id = $1`,
    [schoolId, n]
  );

  return formatParentClientNumber(n);
}

/**
 * Nadaje client_number rodzicowi jeśli brak — zwraca numer.
 * Używane przy lazy allocate (stare konta / race).
 */
export async function ensureParentClientNumber(
  client: Queryable,
  parentId: string,
  schoolId: string
): Promise<string> {
  const existing = await client.query<{ client_number: string | null }>(
    `SELECT client_number FROM users
     WHERE id = $1 AND role = 'PARENT'
     FOR UPDATE`,
    [parentId]
  );
  const row = existing.rows[0];
  if (!row) throw new Error("Nie znaleziono rodzica");
  if (row.client_number && /^\d{5}$/.test(row.client_number)) {
    return row.client_number;
  }
  const next = await allocateParentClientNumber(client, schoolId);
  const upd = await client.query<{ client_number: string }>(
    `UPDATE users SET client_number = $2
     WHERE id = $1 AND client_number IS NULL
     RETURNING client_number`,
    [parentId, next]
  );
  if (upd.rows[0]?.client_number) return upd.rows[0].client_number;
  const check = await client.query<{ client_number: string | null }>(
    `SELECT client_number FROM users WHERE id = $1`,
    [parentId]
  );
  const assigned = check.rows[0]?.client_number;
  if (!assigned) throw new Error("Nie udało się zapisać numeru klienta rodzica");
  return assigned;
}

export async function allocateChildClientNumber(
  client: Queryable,
  schoolId: string,
  parentId: string
): Promise<string> {
  const parentNumber = await ensureParentClientNumber(client, parentId, schoolId);

  await client.query(
    `SELECT id FROM children WHERE parent_id = $1 AND school_id = $2 FOR UPDATE`,
    [parentId, schoolId]
  );

  const maxRes = await client.query<{ max_seq: string | null }>(
    `SELECT MAX(
       CASE
         WHEN client_number ~ ('^' || $2 || '/[0-9]+$')
         THEN NULLIF(split_part(client_number, '/', 2), '')::int
         ELSE NULL
       END
     )::text AS max_seq
     FROM children
     WHERE parent_id = $1
       AND school_id = $3`,
    [parentId, parentNumber, schoolId]
  );

  const maxSeq = Number(maxRes.rows[0]?.max_seq ?? 0);
  const nextSeq = (Number.isFinite(maxSeq) ? maxSeq : 0) + 1;
  return formatChildClientNumber(parentNumber, nextSeq);
}

export async function ensureChildClientNumber(
  client: Queryable,
  childId: string,
  schoolId: string,
  parentId: string
): Promise<string> {
  const existing = await client.query<{ client_number: string | null }>(
    `SELECT client_number FROM children WHERE id = $1 FOR UPDATE`,
    [childId]
  );
  const row = existing.rows[0];
  if (!row) throw new Error("Nie znaleziono dziecka");
  if (row.client_number && /^\d{5}\/\d+$/.test(row.client_number)) {
    return row.client_number;
  }
  const next = await allocateChildClientNumber(client, schoolId, parentId);
  const upd = await client.query<{ client_number: string }>(
    `UPDATE children SET client_number = $2
     WHERE id = $1 AND client_number IS NULL
     RETURNING client_number`,
    [childId, next]
  );
  if (upd.rows[0]?.client_number) return upd.rows[0].client_number;
  const check = await client.query<{ client_number: string | null }>(
    `SELECT client_number FROM children WHERE id = $1`,
    [childId]
  );
  const assigned = check.rows[0]?.client_number;
  if (!assigned) throw new Error("Nie udało się zapisać numeru klienta dziecka");
  return assigned;
}
