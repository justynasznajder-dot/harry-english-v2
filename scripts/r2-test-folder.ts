/**
 * Diagnostyka R2 + utworzenie testowego folderu `_test/` w bucketcie.
 * Usage: npx tsx scripts/r2-test-folder.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import {
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName =
    process.env.R2_BUCKET_NAME?.trim() || "harryenglish-v2-files";

  console.log("R2 config:");
  console.log("  accountId:", accountId ? `${accountId.slice(0, 8)}…` : "MISSING");
  console.log("  accessKeyId:", accessKeyId ? `${accessKeyId.slice(0, 6)}…` : "MISSING");
  console.log("  secretAccessKey:", secretAccessKey ? `set (${secretAccessKey.length} chars)` : "MISSING");
  console.log("  bucket:", bucketName);
  console.log("  endpoint:", accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "n/a");

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Brak R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  console.log("\n1) HeadBucket…");
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log("   OK — bucket istnieje i jest dostępny");
  } catch (err) {
    console.error("   FAIL HeadBucket:", err instanceof Error ? err.message : err);
    if (err && typeof err === "object" && "$metadata" in err) {
      console.error("   metadata:", (err as { $metadata?: unknown }).$metadata);
    }
  }

  console.log("\n2) ListObjectsV2 (max 20)…");
  try {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 20 })
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key);
    console.log(`   OK — ${keys.length} obiekt(ów) (KeyCount=${listed.KeyCount ?? 0})`);
    for (const k of keys) console.log(`   - ${k}`);
  } catch (err) {
    console.error("   FAIL List:", err instanceof Error ? err.message : err);
    if (err && typeof err === "object" && "name" in err) {
      console.error("   name:", (err as { name?: string }).name);
    }
    if (err && typeof err === "object" && "$metadata" in err) {
      console.error("   metadata:", (err as { $metadata?: unknown }).$metadata);
    }
  }

  const testKey = `_test/hello.txt`;
  const body = `HarryEnglish R2 test ${new Date().toISOString()}\n`;

  console.log(`\n3) PutObject → ${testKey}…`);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: testKey,
        Body: body,
        ContentType: "text/plain; charset=utf-8",
        ContentLength: Buffer.byteLength(body),
      })
    );
    console.log("   OK — zapisano");
  } catch (err) {
    console.error("   FAIL Put:", err instanceof Error ? err.message : err);
    if (err && typeof err === "object" && "$metadata" in err) {
      console.error("   metadata:", (err as { $metadata?: unknown }).$metadata);
    }
    if (err && typeof err === "object" && "Code" in err) {
      console.error("   Code:", (err as { Code?: string }).Code);
    }
    throw err;
  }

  console.log(`\n4) GetObject → ${testKey}…`);
  try {
    const got = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: testKey })
    );
    const text = await got.Body?.transformToString();
    console.log("   OK — odczyt:", JSON.stringify(text));
  } catch (err) {
    console.error("   FAIL Get:", err instanceof Error ? err.message : err);
    throw err;
  }

  console.log(`\n5) ListObjectsV2 prefix=_test/…`);
  const listedTest = await client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: "_test/" })
  );
  for (const o of listedTest.Contents ?? []) {
    console.log(`   - ${o.Key} (${o.Size} B)`);
  }

  console.log("\nGotowe. Folder `_test/` w bucketcie", bucketName);
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
