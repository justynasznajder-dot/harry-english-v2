-- Powod rezygnacji / odrzucenia zgloszenia (wpis managera).

ALTER TABLE "enrollment_requests"
  ADD COLUMN IF NOT EXISTS "rejection_comment" TEXT;
