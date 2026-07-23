-- Stałe ID klienta (rodzic/dziecko) + kolumna numeru umowy + liczniki faktur per rodzic/miesiąc

-- 1) Kolumny
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "client_number" VARCHAR(5);
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "client_number" VARCHAR(16);
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "contract_number" VARCHAR(40);

-- 2) Licznik numerów klienta per szkoła
CREATE TABLE IF NOT EXISTS "client_number_counters" (
  "school_id" TEXT NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "client_number_counters_pkey" PRIMARY KEY ("school_id"),
  CONSTRAINT "client_number_counters_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- 3) Licznik faktur sprzedaży per rodzic + miesiąc
CREATE TABLE IF NOT EXISTS "invoice_parent_month_counters" (
  "school_id" TEXT NOT NULL,
  "parent_id" TEXT NOT NULL,
  "year_month" VARCHAR(7) NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoice_parent_month_counters_pkey"
    PRIMARY KEY ("school_id", "parent_id", "year_month"),
  CONSTRAINT "invoice_parent_month_counters_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "invoice_parent_month_counters_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_invoice_parent_month_counters_parent"
  ON "invoice_parent_month_counters" ("parent_id");

-- 4) Backfill: rodzice (kolejność created_at ASC) per szkoła
WITH ranked_parents AS (
  SELECT
    id,
    school_id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM "users"
  WHERE role = 'PARENT'
    AND school_id IS NOT NULL
    AND client_number IS NULL
)
UPDATE "users" u
SET client_number = lpad(rp.rn::text, 5, '0')
FROM ranked_parents rp
WHERE u.id = rp.id;

-- 5) Ustaw liczniki rodziców na MAX
INSERT INTO "client_number_counters" ("school_id", "last_number", "updated_at")
SELECT school_id, MAX(client_number::integer), NOW()
FROM "users"
WHERE role = 'PARENT'
  AND school_id IS NOT NULL
  AND client_number IS NOT NULL
  AND client_number ~ '^\d{5}$'
GROUP BY school_id
ON CONFLICT ("school_id") DO UPDATE
SET
  last_number = GREATEST(
    "client_number_counters".last_number,
    EXCLUDED.last_number
  ),
  updated_at = NOW();

-- 6) Backfill: dzieci (kolejność created_at ASC) per rodzic
WITH ranked_children AS (
  SELECT
    c.id,
    c.school_id,
    u.client_number AS parent_client_number,
    ROW_NUMBER() OVER (
      PARTITION BY c.parent_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS rn
  FROM "children" c
  INNER JOIN "users" u ON u.id = c.parent_id
  WHERE c.client_number IS NULL
    AND u.client_number IS NOT NULL
)
UPDATE "children" ch
SET client_number = rc.parent_client_number || '/' || rc.rn::text
FROM ranked_children rc
WHERE ch.id = rc.id;

-- 7) Unikalność (NULL dozwolone wielokrotnie w PostgreSQL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_school_client_number_key'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_school_client_number_key"
      UNIQUE ("school_id", "client_number");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'children_school_client_number_key'
  ) THEN
    ALTER TABLE "children"
      ADD CONSTRAINT "children_school_client_number_key"
      UNIQUE ("school_id", "client_number");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_school_contract_number_key'
  ) THEN
    ALTER TABLE "contracts"
      ADD CONSTRAINT "contracts_school_contract_number_key"
      UNIQUE ("school_id", "contract_number");
  END IF;
END $$;
