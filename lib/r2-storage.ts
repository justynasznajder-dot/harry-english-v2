import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { ContractPdfFile } from "@/lib/contract-pdf";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();

  const missing = [
    !accountId && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !bucketName && "R2_BUCKET_NAME",
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
    bucketName: bucketName!,
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
      // AWS SDK 3.729+ wysyła checksumy domyślnie — R2 ich nie obsługuje.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return cachedClient;
}

function slugPathSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

/** `{school_id}/dokumenty/{Imie-Nazwisko-PESEL}/umowa/{rok}` */
export function buildSignedContractR2Prefix(params: {
  schoolId: string;
  parentFullName: string;
  parentPesel: string;
  signedAt: Date;
}): string {
  const year = params.signedAt.getFullYear();
  const nameSlug = slugPathSegment(params.parentFullName);
  const peselSlug = slugPathSegment(params.parentPesel);
  const parentFolder = peselSlug ? `${nameSlug}-${peselSlug}` : nameSlug;
  return `${params.schoolId}/dokumenty/${parentFolder}/umowa/${year}`;
}

export async function storeSignedContractPdfsInR2(params: {
  schoolId: string;
  parentFullName: string;
  parentPesel: string;
  signedAt: Date;
  pdfFiles: ContractPdfFile[];
}): Promise<string[]> {
  const config = getR2Config();
  const client = getR2Client(config);
  const prefix = buildSignedContractR2Prefix(params);
  const uploadedKeys: string[] = [];

  for (const file of params.pdfFiles) {
    const key = `${prefix}/${file.filename}`;
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: file.content,
        ContentType: "application/pdf",
        ContentLength: file.content.length,
      })
    );
    uploadedKeys.push(key);
  }

  console.info(
    `[R2] Zapisano ${uploadedKeys.length} PDF(ów) w ${config.bucketName}: ${uploadedKeys.join(", ")}`
  );

  return uploadedKeys;
}

export type R2StoredFile = {
  key: string;
  filename: string;
  size: number | null;
  lastModified: string | null;
};

export async function listR2ObjectsUnderPrefix(prefix: string): Promise<R2StoredFile[]> {
  const config = getR2Config();
  const client = getR2Client(config);
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: normalizedPrefix,
    })
  );

  return (res.Contents ?? [])
    .filter((obj) => obj.Key && !obj.Key.endsWith("/"))
    .map((obj) => ({
      key: obj.Key!,
      filename: obj.Key!.split("/").pop() ?? obj.Key!,
      size: obj.Size ?? null,
      lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
    }));
}

export async function getR2ObjectBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const config = getR2Config();
  const client = getR2Client(config);

  const res = await client.send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );

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

export async function listSignedContractPdfsForParent(params: {
  schoolId: string;
  parentFullName: string;
  parentPesel: string;
}): Promise<R2StoredFile[]> {
  const config = getR2Config();
  const client = getR2Client(config);

  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: `${params.schoolId}/dokumenty/`,
    })
  );

  const nameSlug = slugPathSegment(params.parentFullName);
  const peselSlug = slugPathSegment(params.parentPesel);
  const parentFolder = peselSlug ? `${nameSlug}-${peselSlug}` : nameSlug;
  const folderNeedle = `/dokumenty/${parentFolder}/umowa/`;

  return (res.Contents ?? [])
    .filter((obj) => obj.Key?.includes(folderNeedle) && obj.Key.endsWith(".pdf"))
    .map((obj) => ({
      key: obj.Key!,
      filename: obj.Key!.split("/").pop() ?? obj.Key!,
      size: obj.Size ?? null,
      lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
    }))
    .sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
}
