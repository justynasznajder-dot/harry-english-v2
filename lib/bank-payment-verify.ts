import { randomUUID } from "crypto";
import type { PoolClient } from "pg";

import {
  parseIngBankStatementCsv,
  titleContainsClientNumber,
  titleContainsInvoiceNumber,
} from "@/lib/bank-statement-parse";
import { queryDb, runPgTransaction, withPgAdvisoryLock } from "@/lib/db";
import {
  BANK_STATEMENT_PROCESSED_PREFIX,
  downloadGoogleDriveFile,
  getBankStatementsFolderId,
  isBankStatementFileName,
  isBankStatementsDriveConfigured,
  isYearFolderName,
  listGoogleDriveChildren,
  renameGoogleDriveFile,
  type GoogleDriveListedFile,
} from "@/lib/google-drive";

export type BankImportFileResult = {
  driveFileId: string;
  driveFileName: string;
  yearFolder: string;
  transferCount: number;
  skipped: boolean;
  error?: string;
};

export type PaymentVerifyMatch = {
  paymentId: string;
  invoiceNumber: string;
  amount: number;
  transferId: string;
  title: string;
};

export type VerifyPaymentsResult = {
  importedFiles: BankImportFileResult[];
  transfersImported: number;
  matched: PaymentVerifyMatch[];
  alreadyPaid: number;
  unmatchedPending: number;
};

type PendingInvoiceRow = {
  payment_id: string;
  invoice_number: string;
  amount: string;
  client_number: string | null;
  issue_date: string;
};

type UnmatchedTransferRow = {
  id: string;
  title: string;
  amount: string;
  transaction_date: string;
};

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function decodeCsvBuffer(buf: Buffer): string {
  // ING często eksportuje Windows-1250; spróbuj UTF-8, potem 1250 gdy typowe znaki zepsute
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("\uFFFD") && /Data transakcji|Tytuł|tytuł/i.test(utf8)) {
    return utf8;
  }
  try {
    return new TextDecoder("windows-1250").decode(buf);
  } catch {
    return utf8;
  }
}

async function alreadyImportedFileIds(schoolId: string): Promise<Set<string>> {
  const r = await queryDb<{ drive_file_id: string }>(
    `SELECT drive_file_id FROM bank_statement_imports WHERE school_id = $1`,
    [schoolId]
  );
  return new Set(r.rows.map((row) => row.drive_file_id));
}

async function importOneStatementFile(params: {
  schoolId: string;
  yearFolder: string;
  file: GoogleDriveListedFile;
}): Promise<BankImportFileResult> {
  const { schoolId, yearFolder, file } = params;
  const base: BankImportFileResult = {
    driveFileId: file.id,
    driveFileName: file.name,
    yearFolder,
    transferCount: 0,
    skipped: false,
  };

  try {
    const buf = await downloadGoogleDriveFile(file.id);
    const content = decodeCsvBuffer(buf);
    const transfers = parseIngBankStatementCsv(content);

    await runPgTransaction(async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM bank_statement_imports
         WHERE school_id = $1 AND drive_file_id = $2
         LIMIT 1`,
        [schoolId, file.id]
      );
      if (existing.rows[0]) {
        base.skipped = true;
        return;
      }

      const importId = randomUUID();
      await client.query(
        `INSERT INTO bank_statement_imports (
           id, school_id, drive_file_id, drive_file_name, year_folder, transfer_count, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 0, NOW())`,
        [importId, schoolId, file.id, file.name, yearFolder]
      );

      let inserted = 0;
      for (const t of transfers) {
        const txId = t.bankTransactionId?.trim() || null;
        if (txId) {
          const dup = await client.query<{ id: string }>(
            `SELECT id FROM bank_transfers
             WHERE school_id = $1 AND bank_transaction_id = $2
             LIMIT 1`,
            [schoolId, txId]
          );
          if (dup.rows[0]) continue;
        }

        await client.query(
          `INSERT INTO bank_transfers (
             id, school_id, import_id, transaction_date, booking_date,
             counterparty, title, amount, currency, bank_transaction_id, created_at
           ) VALUES (
             $1, $2, $3, $4::date, $5::date,
             $6, $7, $8, $9, $10, NOW()
           )`,
          [
            randomUUID(),
            schoolId,
            importId,
            t.transactionDate,
            t.bookingDate,
            t.counterparty.slice(0, 512),
            t.title,
            t.amount,
            t.currency,
            txId,
          ]
        );
        inserted += 1;
      }

      await client.query(
        `UPDATE bank_statement_imports SET transfer_count = $2 WHERE id = $1`,
        [importId, inserted]
      );
      base.transferCount = inserted;
    });

    if (!base.skipped) {
      const newName = file.name.startsWith(BANK_STATEMENT_PROCESSED_PREFIX)
        ? file.name
        : `${BANK_STATEMENT_PROCESSED_PREFIX}${file.name}`;
      try {
        await renameGoogleDriveFile(file.id, newName);
        base.driveFileName = newName;
      } catch (renameErr) {
        console.warn(
          "Nie udało się oznaczyć pliku wyciągu na Drive (import zapisany w DB):",
          renameErr
        );
      }
    }

    return base;
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "Błąd importu wyciągu",
    };
  }
}

/**
 * Importuje nowe CSV z folderu roku kalendarzowego na Drive → bank_transfers.
 * Struktura: Wyciagi_bankowe / {YYYY} / *.csv (bez podziału na miesiące).
 * @param calendarYear — np. 2026; gdy podany, skanuje tylko ten folder roku.
 */
export async function importNewBankStatementsFromDrive(
  schoolId: string,
  calendarYear?: number
): Promise<{ files: BankImportFileResult[]; transfersImported: number }> {
  if (!isBankStatementsDriveConfigured()) {
    throw new Error(
      "Google Drive nie jest skonfigurowany (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)."
    );
  }

  const rootId = getBankStatementsFolderId();
  let yearFolders = (await listGoogleDriveChildren(rootId)).filter(
    (f) =>
      f.mimeType === "application/vnd.google-apps.folder" && isYearFolderName(f.name)
  );

  if (calendarYear != null) {
    const wanted = String(calendarYear);
    yearFolders = yearFolders.filter((f) => f.name === wanted);
    if (yearFolders.length === 0) {
      throw new Error(
        `Brak folderu roku ${wanted} na Google Drive (Wyciagi_bankowe/${wanted}).`
      );
    }
  }

  const importedIds = await alreadyImportedFileIds(schoolId);
  const files: BankImportFileResult[] = [];
  let transfersImported = 0;

  for (const year of yearFolders.sort((a, b) => a.name.localeCompare(b.name))) {
    const children = await listGoogleDriveChildren(year.id);
    const csvFiles = children.filter((f) => isBankStatementFileName(f.name));

    for (const file of csvFiles) {
      if (importedIds.has(file.id)) {
        files.push({
          driveFileId: file.id,
          driveFileName: file.name,
          yearFolder: year.name,
          transferCount: 0,
          skipped: true,
        });
        continue;
      }
      const result = await importOneStatementFile({
        schoolId,
        yearFolder: year.name,
        file,
      });
      files.push(result);
      if (!result.error && !result.skipped) {
        transfersImported += result.transferCount;
        importedIds.add(file.id);
      }
    }
  }

  return { files, transfersImported };
}

async function loadPendingInvoices(schoolId: string): Promise<PendingInvoiceRow[]> {
  const r = await queryDb<PendingInvoiceRow>(
    `SELECT
       p.id AS payment_id,
       i.invoice_number,
       i.amount::text AS amount,
       u.client_number,
       i.issue_date::text AS issue_date
     FROM payments p
     JOIN invoices i ON i.payment_id = p.id
     LEFT JOIN users u ON u.id = i.parent_id
     WHERE p.school_id = $1
       AND COALESCE(i.document_type, 'SALE') = 'SALE'
       AND UPPER(COALESCE(p.status, 'PENDING')) IN ('PENDING', 'UNPAID', 'OVERDUE')
     ORDER BY i.issue_date ASC, i.created_at ASC`,
    [schoolId]
  );
  return r.rows;
}

async function loadUnmatchedTransfers(schoolId: string): Promise<UnmatchedTransferRow[]> {
  const r = await queryDb<UnmatchedTransferRow>(
    `SELECT id, title, amount::text AS amount, transaction_date::text AS transaction_date
     FROM bank_transfers
     WHERE school_id = $1
       AND matched_payment_id IS NULL
     ORDER BY transaction_date ASC, created_at ASC`,
    [schoolId]
  );
  return r.rows;
}

async function markPaymentPaid(
  client: PoolClient,
  params: { paymentId: string; transferId: string; paidAt: string }
): Promise<void> {
  await client.query(
    `UPDATE payments
     SET status = 'PAID', paid_at = COALESCE(paid_at, $2::timestamptz)
     WHERE id = $1
       AND UPPER(COALESCE(status, 'PENDING')) IN ('PENDING', 'UNPAID', 'OVERDUE')`,
    [params.paymentId, params.paidAt]
  );
  await client.query(
    `UPDATE bank_transfers
     SET matched_payment_id = $2, matched_at = NOW()
     WHERE id = $1 AND matched_payment_id IS NULL`,
    [params.transferId, params.paymentId]
  );
}

/**
 * Dopasowuje nieopłacone faktury do przelewów:
 * 1) numer faktury w tytule + kwota
 * 2) nr klienta w tytule + kwota (kolejność chronologiczna)
 */
export async function matchPendingPaymentsToBankTransfers(
  schoolId: string
): Promise<{ matched: PaymentVerifyMatch[]; alreadyPaid: number; unmatchedPending: number }> {
  const pending = await loadPendingInvoices(schoolId);
  const transfers = await loadUnmatchedTransfers(schoolId);
  const usedTransferIds = new Set<string>();
  const matched: PaymentVerifyMatch[] = [];

  const tryMatch = (
    inv: PendingInvoiceRow,
    preferInvoiceNumber: boolean
  ): UnmatchedTransferRow | null => {
    const invAmount = Number(inv.amount);
    const clientNumber = String(inv.client_number ?? "").trim();
    for (const t of transfers) {
      if (usedTransferIds.has(t.id)) continue;
      if (!amountsEqual(Number(t.amount), invAmount)) continue;
      const byInvoice = titleContainsInvoiceNumber(t.title, inv.invoice_number);
      const byClient =
        clientNumber.length > 0 && titleContainsClientNumber(t.title, clientNumber);
      if (preferInvoiceNumber) {
        if (byInvoice) return t;
      } else if (byClient || byInvoice) {
        return t;
      }
    }
    return null;
  };

  // Pass 1: dokładny numer faktury
  const stillPending: PendingInvoiceRow[] = [];
  for (const inv of pending) {
    const t = tryMatch(inv, true);
    if (!t) {
      stillPending.push(inv);
      continue;
    }
    usedTransferIds.add(t.id);
    const paidAt = `${t.transaction_date}T12:00:00+02:00`;
    await runPgTransaction((client) =>
      markPaymentPaid(client, {
        paymentId: inv.payment_id,
        transferId: t.id,
        paidAt,
      })
    );
    matched.push({
      paymentId: inv.payment_id,
      invoiceNumber: inv.invoice_number,
      amount: Number(inv.amount),
      transferId: t.id,
      title: t.title,
    });
  }

  // Pass 2: nr klienta + kwota
  for (const inv of stillPending) {
    const t = tryMatch(inv, false);
    if (!t) continue;
    usedTransferIds.add(t.id);
    const paidAt = `${t.transaction_date}T12:00:00+02:00`;
    await runPgTransaction((client) =>
      markPaymentPaid(client, {
        paymentId: inv.payment_id,
        transferId: t.id,
        paidAt,
      })
    );
    matched.push({
      paymentId: inv.payment_id,
      invoiceNumber: inv.invoice_number,
      amount: Number(inv.amount),
      transferId: t.id,
      title: t.title,
    });
  }

  const remainingPending = pending.length - matched.length;
  return {
    matched,
    alreadyPaid: 0,
    unmatchedPending: Math.max(0, remainingPending),
  };
}

/** Import nowych wyciągów z Drive (folder roku) + oznaczenie pasujących płatności jako PAID. */
export async function verifyInvoicePaymentsFromBank(
  schoolId: string,
  opts?: { calendarYear?: number }
): Promise<VerifyPaymentsResult> {
  return withPgAdvisoryLock("bank-payment-verify", schoolId, async () => {
    const imported = await importNewBankStatementsFromDrive(
      schoolId,
      opts?.calendarYear
    );
    const match = await matchPendingPaymentsToBankTransfers(schoolId);
    return {
      importedFiles: imported.files,
      transfersImported: imported.transfersImported,
      matched: match.matched,
      alreadyPaid: match.alreadyPaid,
      unmatchedPending: match.unmatchedPending,
    };
  });
}
