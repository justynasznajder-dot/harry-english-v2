import { Readable } from "node:stream";

import { google, type drive_v3 } from "googleapis";

/**
 * Google Drive — eksporty + odczyt wyciągów bankowych (faktury/umowy zostają na R2).
 *
 * Wymagane env (auth):
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY  (z JSON; \n jako literal "\\n" OK)
 *
 * Upload / domyślny folder:
 * - GOOGLE_DRIVE_FOLDER_ID
 *
 * Wyciągi bankowe (foldery lat kalendarzowych):
 * - GOOGLE_DRIVE_BANK_STATEMENTS_FOLDER_ID  (opcjonalnie; domyślnie folder wyciągów)
 *
 * Opcjonalnie:
 * - GOOGLE_DRIVE_SHARED_DRIVE_ID  (gdy folder jest na Shared Drive)
 */

/** Domyślny folder wyciągów: lata kalendarzowe → pliki CSV ING. */
export const DEFAULT_BANK_STATEMENTS_FOLDER_ID = "1Akf2fsW8D01wdH7r0MshqthjhbBx8Uu5";

/** Prefiks nazwy pliku po imporcie — system pomija takie pliki przy kolejnym skanie. */
export const BANK_STATEMENT_PROCESSED_PREFIX = "PRZETWORZONE_";

type GoogleDriveCredentials = {
  clientEmail: string;
  privateKey: string;
  sharedDriveId?: string;
};

type GoogleDriveConfig = GoogleDriveCredentials & {
  folderId: string;
};

export type GoogleDriveUploadResult = {
  fileId: string;
  name: string;
  webViewLink: string | null;
  webContentLink: string | null;
};

export type GoogleDriveListedFile = {
  id: string;
  name: string;
  mimeType: string;
};

function getGoogleDriveCredentials(): GoogleDriveCredentials {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const sharedDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim() || undefined;

  const missing = [
    !clientEmail && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    !privateKeyRaw && "GOOGLE_PRIVATE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Google Drive not configured — brak zmiennych: ${missing.join(", ")}. Dodaj je do .env.local / Vercel i zrestartuj serwer.`
    );
  }

  return {
    clientEmail: clientEmail!,
    privateKey: privateKeyRaw!.replace(/\\n/g, "\n"),
    sharedDriveId,
  };
}

function getGoogleDriveConfig(): GoogleDriveConfig {
  const creds = getGoogleDriveCredentials();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error(
      "Google Drive not configured — brak zmiennej: GOOGLE_DRIVE_FOLDER_ID. Dodaj ją do .env.local / Vercel i zrestartuj serwer."
    );
  }
  return { ...creds, folderId };
}

export function getBankStatementsFolderId(): string {
  return (
    process.env.GOOGLE_DRIVE_BANK_STATEMENTS_FOLDER_ID?.trim() ||
    DEFAULT_BANK_STATEMENTS_FOLDER_ID
  );
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim() &&
      process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
  );
}

export function isBankStatementsDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim()
  );
}

let cachedDrive: drive_v3.Drive | null = null;

function getDriveClient(creds: GoogleDriveCredentials): drive_v3.Drive {
  if (!cachedDrive) {
    const auth = new google.auth.JWT({
      email: creds.clientEmail,
      key: creds.privateKey,
      // drive (nie drive.file) — odczyt plików wrzuconych ręcznie do udostępnionego folderu
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    cachedDrive = google.drive({ version: "v3", auth });
  }
  return cachedDrive;
}

function driveListSupports(creds: GoogleDriveCredentials) {
  const supportsAllDrives = Boolean(creds.sharedDriveId);
  return {
    supportsAllDrives,
    includeItemsFromAllDrives: supportsAllDrives,
    corpora: supportsAllDrives ? ("drive" as const) : undefined,
    driveId: creds.sharedDriveId,
  };
}

function toReadable(body: Buffer | Readable | string): Readable {
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    return Readable.from(body);
  }
  return body;
}

/**
 * Zapisuje plik w skonfigurowanym folderze Google Drive.
 * Zwraca id i linki — do zapisu w DB przy przyszłych eksportach.
 */
export async function uploadFileToGoogleDrive(params: {
  name: string;
  mimeType: string;
  body: Buffer | Readable | string;
  /** Nadpisuje domyślny GOOGLE_DRIVE_FOLDER_ID (np. podfolder eksportu). */
  folderId?: string;
}): Promise<GoogleDriveUploadResult> {
  const config = getGoogleDriveConfig();
  const drive = getDriveClient(config);
  const parentId = params.folderId?.trim() || config.folderId;
  const supportsAllDrives = Boolean(config.sharedDriveId);

  const res = await drive.files.create({
    requestBody: {
      name: params.name,
      parents: [parentId],
    },
    media: {
      mimeType: params.mimeType,
      body: toReadable(params.body),
    },
    fields: "id, name, webViewLink, webContentLink",
    supportsAllDrives,
  });

  const file = res.data;
  if (!file.id || !file.name) {
    throw new Error("Google Drive upload failed — brak id/name w odpowiedzi API.");
  }

  return {
    fileId: file.id,
    name: file.name,
    webViewLink: file.webViewLink ?? null,
    webContentLink: file.webContentLink ?? null,
  };
}

/**
 * Tworzy podfolder w folderze docelowym (np. "eksporty/2025-2026").
 * Jeśli folder o tej nazwie już istnieje — zwraca jego id.
 */
export async function ensureGoogleDriveSubfolder(name: string, parentFolderId?: string): Promise<string> {
  const config = getGoogleDriveConfig();
  const drive = getDriveClient(config);
  const parentId = parentFolderId?.trim() || config.folderId;
  const supportsAllDrives = Boolean(config.sharedDriveId);

  const escapedName = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escapedName}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${parentId}' in parents`,
    "trashed = false",
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives,
    includeItemsFromAllDrives: supportsAllDrives,
    corpora: supportsAllDrives ? "drive" : undefined,
    driveId: config.sharedDriveId,
  });

  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives,
  });

  if (!created.data.id) {
    throw new Error(`Google Drive: nie udało się utworzyć folderu "${name}".`);
  }
  return created.data.id;
}

/** Lista dzieci (pliki/foldery) w folderze Drive. */
export async function listGoogleDriveChildren(
  parentFolderId: string
): Promise<GoogleDriveListedFile[]> {
  const creds = getGoogleDriveCredentials();
  const drive = getDriveClient(creds);
  const listOpts = driveListSupports(creds);
  const out: GoogleDriveListedFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 100,
      pageToken,
      ...listOpts,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue;
      out.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType ?? "application/octet-stream",
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}

/** Pobiera zawartość pliku binarnego z Drive do Buffer. */
export async function downloadGoogleDriveFile(fileId: string): Promise<Buffer> {
  const creds = getGoogleDriveCredentials();
  const drive = getDriveClient(creds);
  const res = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: Boolean(creds.sharedDriveId),
    },
    { responseType: "arraybuffer" }
  );
  const data = res.data as ArrayBuffer | Buffer | string;
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data);
  return Buffer.from(data);
}

/** Zmienia nazwę pliku na Drive (np. prefix PRZETWORZONE_). */
export async function renameGoogleDriveFile(
  fileId: string,
  newName: string
): Promise<string> {
  const creds = getGoogleDriveCredentials();
  const drive = getDriveClient(creds);
  const res = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: "id, name",
    supportsAllDrives: Boolean(creds.sharedDriveId),
  });
  return res.data.name ?? newName;
}

export function isBankStatementFileName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (lower.startsWith(BANK_STATEMENT_PROCESSED_PREFIX.toLowerCase())) return false;
  return lower.endsWith(".csv") || lower.endsWith(".txt");
}

export function isYearFolderName(name: string): boolean {
  return /^\d{4}$/.test(name.trim());
}
