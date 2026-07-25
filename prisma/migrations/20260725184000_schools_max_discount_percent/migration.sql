-- Maksymalny łączny rabat % na poziomie szkoły (domyślnie 10)
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "max_discount_percent" DECIMAL(5, 2) NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_max_discount_percent_check'
  ) THEN
    ALTER TABLE "schools"
      ADD CONSTRAINT "schools_max_discount_percent_check"
      CHECK ("max_discount_percent" >= 0 AND "max_discount_percent" <= 100);
  END IF;
END $$;
