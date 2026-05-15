-- Kolumny do obsługi odrzucenia propozycji przez rodzica.
-- `rejection_comment` zwykle juz istnieje (model Prisma zna to pole),
-- `rejected_at` dodajemy swiezo, aby miec znacznik czasu wydarzenia.
ALTER TABLE enrollment_requests
  ADD COLUMN IF NOT EXISTS rejection_comment TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at       TIMESTAMP;
