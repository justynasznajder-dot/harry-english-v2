import type { ContractPdfFile } from "@/lib/contract-pdf";
import { queryDb } from "@/lib/db";
import { formatPersonName } from "@/lib/format-person-name";
import {
  deleteGoogleDriveFile,
  downloadGoogleDriveFile,
  ensureGoogleDriveSubfolder,
  getUmowyFolderId,
  listGoogleDriveFilesByParentAppProperty,
  uploadFileToGoogleDrive,
} from "@/lib/google-drive";

export type DocumentKind = "umowy" | "faktury";

export type StoredDocumentFile = {
  key: string;
  filename: string;
  size: number | null;
  lastModified: string | null;
};

const DRIVE_KEY_PREFIX = "gdrive";

/** Szkoła testowa (DEV) — dokumenty pod `Umowy/TEST/...` */
export const DRIVE_TEST_SCHOOL_ID = "efcb641a-e5bd-4e59-aa39-c08fd1b318e9";
export const DRIVE_TEST_FOLDER_NAME = "TEST";

export function usesDriveTestFolder(schoolId: string): boolean {
  return schoolId.trim() === DRIVE_TEST_SCHOOL_ID;
}

/** Nazwa folderu rodzica na Drive: Nazwisko_Imię */
export function buildParentDriveFolderName(
  lastName: string,
  firstName: string
): string {
  const sanitize = (raw: string, fallback: string) => {
    const formatted = formatPersonName(raw)
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return formatted || fallback;
  };
  return `${sanitize(lastName, "Nazwisko")}_${sanitize(firstName, "Imie")}`;
}

export function buildDriveDocumentKey(params: {
  parentUserId: string;
  kind: DocumentKind;
  fileId: string;
  filename: string;
}): string {
  const filename = params.filename.replace(/[/\\]/g, "_");
  return `${DRIVE_KEY_PREFIX}/${params.parentUserId}/${params.kind}/${params.fileId}/${filename}`;
}

export function parseDriveDocumentKey(key: string): {
  parentUserId: string;
  kind: DocumentKind;
  fileId: string;
  filename: string;
} | null {
  const m = key
    .trim()
    .match(
      /^gdrive\/([^/]+)\/(umowy|faktury)\/([^/]+)\/([^/]+\.pdf)$/i
    );
  if (!m) return null;
  return {
    parentUserId: m[1]!,
    kind: m[2]!.toLowerCase() as DocumentKind,
    fileId: m[3]!,
    filename: m[4]!,
  };
}

/** Czy klucz dokumentu należy do folderu danego rodzica (umowy lub faktury). */
export function isParentDokumentyKeyAllowed(params: {
  key: string;
  parentUserId: string;
  kind?: DocumentKind;
}): boolean {
  const parentUserId = params.parentUserId.trim();
  if (!parentUserId || params.key.includes("..")) return false;

  const parsed = parseDriveDocumentKey(params.key);
  if (!parsed) return false;
  if (parsed.parentUserId !== parentUserId) return false;
  if (params.kind && parsed.kind !== params.kind) return false;
  return true;
}

async function resolveParentNames(params: {
  parentUserId: string;
  parentFirstName?: string | null;
  parentLastName?: string | null;
}): Promise<{ firstName: string; lastName: string }> {
  const fromParamsFirst = params.parentFirstName?.trim() ?? "";
  const fromParamsLast = params.parentLastName?.trim() ?? "";
  if (fromParamsFirst && fromParamsLast) {
    return { firstName: fromParamsFirst, lastName: fromParamsLast };
  }

  const res = await queryDb<{ first_name: string | null; last_name: string | null }>(
    `SELECT first_name, last_name FROM users WHERE id = $1 LIMIT 1`,
    [params.parentUserId]
  );
  const row = res.rows[0];
  return {
    firstName: fromParamsFirst || String(row?.first_name ?? "").trim() || "Imie",
    lastName: fromParamsLast || String(row?.last_name ?? "").trim() || "Nazwisko",
  };
}

async function resolveSchoolId(params: {
  schoolId?: string | null;
  parentUserId: string;
}): Promise<string> {
  const fromParams = params.schoolId?.trim() ?? "";
  if (fromParams) return fromParams;

  const res = await queryDb<{ school_id: string | null }>(
    `SELECT school_id FROM users WHERE id = $1 LIMIT 1`,
    [params.parentUserId]
  );
  return String(res.rows[0]?.school_id ?? "").trim();
}

/** Prod: Umowy → rok; test: Umowy → TEST → rok */
async function resolveUmowySchoolRootFolderId(schoolId: string): Promise<string> {
  const umowyRoot = getUmowyFolderId();
  if (usesDriveTestFolder(schoolId)) {
    return ensureGoogleDriveSubfolder(DRIVE_TEST_FOLDER_NAME, umowyRoot);
  }
  return umowyRoot;
}

async function ensureParentYearFolder(params: {
  schoolId: string;
  year: number;
  parentFirstName: string;
  parentLastName: string;
}): Promise<string> {
  if (!Number.isInteger(params.year) || params.year < 2000 || params.year > 2100) {
    throw new Error(`Nieprawidłowy rok folderu Drive: ${params.year}`);
  }
  // Fail-fast zanim powstaną puste foldery (SA nie wrzuci PDF bez Shared Drive).
  if (!process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim()) {
    throw new Error(
      "Google Drive: brak GOOGLE_DRIVE_SHARED_DRIVE_ID. Service account nie może zapisywać plików na zwykłym Dysku — przenieś Umowy na Shared Drive i ustaw ID dysku w env."
    );
  }
  const schoolRootId = await resolveUmowySchoolRootFolderId(params.schoolId);
  const yearFolderId = await ensureGoogleDriveSubfolder(
    String(params.year),
    schoolRootId
  );
  const personFolder = buildParentDriveFolderName(
    params.parentLastName,
    params.parentFirstName
  );
  return ensureGoogleDriveSubfolder(personFolder, yearFolderId);
}

async function uploadPdfToParentFolder(params: {
  parentUserId: string;
  schoolId?: string | null;
  year: number;
  kind: DocumentKind;
  filename: string;
  content: Buffer;
  parentFirstName?: string | null;
  parentLastName?: string | null;
}): Promise<string> {
  const names = await resolveParentNames(params);
  const schoolId = await resolveSchoolId(params);
  const folderId = await ensureParentYearFolder({
    schoolId,
    year: params.year,
    parentFirstName: names.firstName,
    parentLastName: names.lastName,
  });

  const uploaded = await uploadFileToGoogleDrive({
    name: params.filename,
    mimeType: "application/pdf",
    body: params.content,
    folderId,
    appProperties: {
      heParentId: params.parentUserId,
      heKind: params.kind,
    },
  });

  return buildDriveDocumentKey({
    parentUserId: params.parentUserId,
    kind: params.kind,
    fileId: uploaded.fileId,
    filename: uploaded.name || params.filename,
  });
}

export async function storeInvoicePdfInDrive(params: {
  parentUserId: string;
  schoolId?: string | null;
  issuedAt: Date;
  filename: string;
  content: Buffer;
  parentFirstName?: string | null;
  parentLastName?: string | null;
}): Promise<string> {
  return uploadPdfToParentFolder({
    parentUserId: params.parentUserId,
    schoolId: params.schoolId,
    year: params.issuedAt.getFullYear(),
    kind: "faktury",
    filename: params.filename,
    content: params.content,
    parentFirstName: params.parentFirstName,
    parentLastName: params.parentLastName,
  });
}

export async function storeSignedContractPdfsInDrive(params: {
  parentUserId: string;
  schoolId?: string | null;
  signedAt: Date;
  pdfFiles: ContractPdfFile[];
  parentFirstName?: string | null;
  parentLastName?: string | null;
}): Promise<string[]> {
  const uploadedKeys: string[] = [];
  for (const file of params.pdfFiles) {
    const key = await uploadPdfToParentFolder({
      parentUserId: params.parentUserId,
      schoolId: params.schoolId,
      year: params.signedAt.getFullYear(),
      kind: "umowy",
      filename: file.filename,
      content: file.content,
      parentFirstName: params.parentFirstName,
      parentLastName: params.parentLastName,
    });
    uploadedKeys.push(key);
  }
  return uploadedKeys;
}

export async function getDriveDocumentBuffer(
  key: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const parsed = parseDriveDocumentKey(key);
  if (!parsed) {
    throw new Error("Nieprawidłowy klucz dokumentu Google Drive");
  }
  const buffer = await downloadGoogleDriveFile(parsed.fileId);
  return {
    buffer,
    contentType: "application/pdf",
    filename: parsed.filename,
  };
}

/** Best-effort usunięcie (np. orphan po rollbacku faktury). */
export async function deleteDriveDocument(key: string): Promise<void> {
  const parsed = parseDriveDocumentKey(key);
  if (!parsed) {
    throw new Error("Nieprawidłowy klucz dokumentu Google Drive");
  }
  await deleteGoogleDriveFile(parsed.fileId);
}

export async function listSignedContractPdfsForParent(params: {
  parentUserId: string;
}): Promise<StoredDocumentFile[]> {
  const parentUserId = params.parentUserId.trim();
  if (!parentUserId) return [];

  const files = await listGoogleDriveFilesByParentAppProperty({
    parentUserId,
    kind: "umowy",
  });

  return files
    .map((file) => ({
      key: buildDriveDocumentKey({
        parentUserId,
        kind: "umowy",
        fileId: file.id,
        filename: file.name,
      }),
      filename: file.name,
      size: file.size,
      lastModified: file.modifiedTime,
    }))
    .sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
}
