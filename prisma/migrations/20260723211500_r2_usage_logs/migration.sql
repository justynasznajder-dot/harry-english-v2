-- Log operacji Cloudflare R2 (monitoring limitu / atrybucja procesów)
CREATE TABLE "r2_usage_logs" (
  "id" BIGSERIAL NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "op" VARCHAR(16) NOT NULL,
  "billing_class" VARCHAR(8) NOT NULL,
  "source" VARCHAR(64) NOT NULL,
  "bucket" VARCHAR(128) NOT NULL,
  "key_or_prefix" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "error" TEXT,

  CONSTRAINT "r2_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_r2_usage_logs_created_at"
  ON "r2_usage_logs" ("created_at");

CREATE INDEX "idx_r2_usage_logs_source_class_created"
  ON "r2_usage_logs" ("source", "billing_class", "created_at");
