import { Readable } from "node:stream";

import { google, type drive_v3 } from "googleapis";

/**
 * Google Drive — tylko pod przyszłe eksporty (nie umowy/faktury; te zostają na R2).
 *
 * Wymagane env:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY  (z JSON; \n jako literal "\\n" OK)
 * - GOOGLE_DRIVE_FOLDER_ID  (folder udostępniony service accountowi)
 *
 * Opcjonalnie:
 * - GOOGLE_DRIVE_SHARED_DRIVE_ID  (gdy folder jest na Shared Drive)
 */

type GoogleDriveConfig = {
  clientEmail: string;
  privateKey: string;
  folderId: string;
  sharedDriveId?: string;
};

export type GoogleDriveUploadResult = {
  fileId: string;
  name: string;
  webViewLink: string | null;
  webContentLink: string | null;
};

function getGoogleDriveConfig(): GoogleDriveConfig {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const sharedDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim() || undefined;

  const missing = [
    !clientEmail && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    !privateKeyRaw && "GOOGLE_PRIVATE_KEY",
    !folderId && "GOOGLE_DRIVE_FOLDER_ID",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Google Drive not configured — brak zmiennych: ${missing.join(", ")}. Dodaj je do .env.local / Vercel i zrestartuj serwer.`
    );
  }

  return {
    clientEmail: clientEmail!,
    privateKey: privateKeyRaw!.replace(/\\n/g, "\n"),
    folderId: folderId!,
    sharedDriveId,
  };
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim() &&
      process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
  );
}

let cachedDrive: drive_v3.Drive | null = null;

function getDriveClient(config: GoogleDriveConfig): drive_v3.Drive {
  if (!cachedDrive) {
    const auth = new google.auth.JWT({
      email: config.clientEmail,
      key: config.privateKey,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
    cachedDrive = google.drive({ version: "v3", auth });
  }
  return cachedDrive;
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
