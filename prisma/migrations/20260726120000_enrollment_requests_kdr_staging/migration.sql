-- Staging KDR na zgłoszeniu przed utworzeniem konta rodzica.
-- Po utworzeniu konta flaga jest kopiowana do parent_profiles.

ALTER TABLE "enrollment_requests"
  ADD COLUMN IF NOT EXISTS "discount_large_family" BOOLEAN NOT NULL DEFAULT false;
