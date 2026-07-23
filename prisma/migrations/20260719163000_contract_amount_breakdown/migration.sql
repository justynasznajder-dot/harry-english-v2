-- Snapshot składowych kwoty umowy + znacznik zamrożenia przy podpisie
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "amount_breakdown" JSONB;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "amount_frozen_at" TIMESTAMP(6);
