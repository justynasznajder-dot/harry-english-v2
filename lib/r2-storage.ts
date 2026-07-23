import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { ContractPdfFile } from "@/lib/contract-pdf";
import { getR2Source, recordR2Usage, type R2Op, type R2Source } from "@/lib/r2-usage";

export type { R2Source } from "@/lib/r2-usage";
export { runWithR2Source } from "@/lib/r2-usage";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

/** Domyślny bucket dokumentów (standard) — nadpisz przez `R2_BUCKET_NAME`. */
export const DEFAULT_R2_BUCKET_NAME = "harryenglish-v2-files";

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName =
    process.env.R2_BUCKET_NAME?.trim() || DEFAULT_R2_BUCKET_NAME;

  const missing = [
    !accountId && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `R2 storage not configured — brak zmiennych: ${missing.join(", ")}. Zrestartuj serwer po dodaniu ich do .env.local lub Vercel.`
    );
  }

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucketName,
  };
}

let cachedClient: S3Client | null = null;

function getR2Client(config: R2Config): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return cachedClient;
}

async function sendR2Command<T>(params: {
  op: R2Op;
  keyOrPrefix: string;
  source?: R2Source;
  run: (client: S3Client, bucket: string) => Promise<T>;
}): Promise<T> {
  const config = getR2Config();
  const client = getR2Client(config);
  const source = params.source ?? getR2Source();
  const started = Date.now();
  try {
    const result = await params.run(client, config.bucketName);
    recordR2Usage({
      op: params.op,
      source,
      bucket: config.bucketName,
      keyOrPrefix: params.keyOrPrefix,
      ok: true,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    recordR2Usage({
      op: params.op,
      source,
      bucket: config.bucketName,
      keyOrPrefix: params.keyOrPrefix,
      ok: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export type DocumentKind = "umowy" | "faktury";

/**
 * `{parentUserId}/{year}/umowy` lub `{parentUserId}/{year}/faktury`
 * — folder klienta = `users.id` rodzica.
 */
export function buildClientDocumentR2Prefix(params: {
  parentUserId: string;
  year: number;
  kind: DocumentKind;
}): string {
  const parentUserId = params.parentUserId.trim();
  if (!parentUserId) throw new Error("Brak parentUserId do ścieżki R2");
  if (!Number.isInteger(params.year) || params.year < 2000 || params.year > 2100) {
    throw new Error(`Nieprawidłowy rok folderu R2: ${params.year}`);
  }
  return `${parentUserId}/${params.year}/${params.kind}`;
}

/** `{parentUserId}/{year}/umowy` */
export function buildSignedContractR2Prefix(params: {
  parentUserId: string;
  signedAt: Date;
}): string {
  return buildClientDocumentR2Prefix({
    parentUserId: params.parentUserId,
    year: params.signedAt.getFullYear(),
    kind: "umowy",
  });
}

/** `{parentUserId}/{year}/faktury` */
export function buildInvoiceR2Prefix(params: {
  parentUserId: string;
  issuedAt: Date;
}): string {
  return buildClientDocumentR2Prefix({
    parentUserId: params.parentUserId,
    year: params.issuedAt.getFullYear(),
    kind: "faktury",
  });
}

/** Czy klucz R2 należy do folderu danego rodzica (umowy lub faktury). */
export function isParentDokumentyKeyAllowed(params: {
  key: string;
  parentUserId: string;
  kind?: DocumentKind;
}): boolean {
  const parentUserId = params.parentUserId.trim();
  if (!parentUserId || !params.key.endsWith(".pdf")) return false;
  if (params.key.includes("..")) return false;

  const prefix = `${parentUserId}/`;
  if (!params.key.startsWith(prefix)) return false;

  // {userId}/{year}/umowy|faktury/{file}.pdf
  const rest = params.key.slice(prefix.length);
  const m = rest.match(/^(\d{4})\/(umowy|faktury)\/[^/]+\.pdf$/i);
  if (!m) return false;
  if (params.kind && m[2].toLowerCase() !== params.kind) return false;
  return true;
}

export async function storeInvoicePdfInR2(params: {
  parentUserId: string;
  issuedAt: Date;
  filename: string;
  content: Buffer;
  source?: R2Source;
}): Promise<string> {
  const prefix = buildInvoiceR2Prefix(params);
  const key = `${prefix}/${params.filename}`;

  await sendR2Command({
    op: "PUT",
    keyOrPrefix: key,
    source: params.source,
    run: async (client, bucket) => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: params.content,
          ContentType: "application/pdf",
          ContentLength: params.content.length,
        })
      );
    },
  });

  return key;
}

export async function storeSignedContractPdfsInR2(params: {
  parentUserId: string;
  signedAt: Date;
  pdfFiles: ContractPdfFile[];
  source?: R2Source;
}): Promise<string[]> {
  const prefix = buildSignedContractR2Prefix(params);
  const uploadedKeys: string[] = [];

  for (const file of params.pdfFiles) {
    const key = `${prefix}/${file.filename}`;
    await sendR2Command({
      op: "PUT",
      keyOrPrefix: key,
      source: params.source,
      run: async (client, bucket) => {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.content,
            ContentType: "application/pdf",
            ContentLength: file.content.length,
          })
        );
      },
    });
    uploadedKeys.push(key);
  }

  return uploadedKeys;
}

export type R2StoredFile = {
  key: string;
  filename: string;
  size: number | null;
  lastModified: string | null;
};

export async function listR2ObjectsUnderPrefix(
  prefix: string,
  options?: { source?: R2Source }
): Promise<R2StoredFile[]> {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  const res = await sendR2Command({
    op: "LIST",
    keyOrPrefix: normalizedPrefix,
    source: options?.source,
    run: async (client, bucket) =>
      client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
        })
      ),
  });

  return (res.Contents ?? [])
    .filter((obj) => obj.Key && !obj.Key.endsWith("/"))
    .map((obj) => ({
      key: obj.Key!,
      filename: obj.Key!.split("/").pop() ?? obj.Key!,
      size: obj.Size ?? null,
      lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
    }));
}

export async function getR2ObjectBuffer(
  key: string,
  options?: { source?: R2Source }
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await sendR2Command({
    op: "GET",
    keyOrPrefix: key,
    source: options?.source,
    run: async (client, bucket) =>
      client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      ),
  });

  const body = res.Body;
  if (!body) {
    throw new Error("Pusty plik w R2");
  }

  const bytes = await body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: res.ContentType ?? "application/octet-stream",
  };
}

/** Best-effort usunięcie obiektu (np. orphan po rollbacku faktury). */
export async function deleteR2Object(
  key: string,
  options?: { source?: R2Source }
): Promise<void> {
  await sendR2Command({
    op: "DELETE",
    keyOrPrefix: key,
    source: options?.source,
    run: async (client, bucket) => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
    },
  });
}

export async function listSignedContractPdfsForParent(params: {
  parentUserId: string;
  source?: R2Source;
}): Promise<R2StoredFile[]> {
  const parentUserId = params.parentUserId.trim();
  if (!parentUserId) return [];

  const files = await listR2ObjectsUnderPrefix(`${parentUserId}/`, {
    source: params.source,
  });
  return files
    .filter((file) =>
      isParentDokumentyKeyAllowed({
        key: file.key,
        parentUserId,
        kind: "umowy",
      })
    )
    .sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
}
