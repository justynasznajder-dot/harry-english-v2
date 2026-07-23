-- school_id na contract_children (tenant + prostsze filtry bez JOIN do contracts)

ALTER TABLE "contract_children" ADD COLUMN IF NOT EXISTS "school_id" TEXT;

UPDATE "contract_children" cc
SET school_id = c.school_id
FROM "contracts" c
WHERE c.id = cc.contract_id
  AND cc.school_id IS NULL;

UPDATE "contract_children" cc
SET school_id = ch.school_id
FROM "children" ch
WHERE ch.id = cc.child_id
  AND cc.school_id IS NULL
  AND ch.school_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "contract_children" WHERE school_id IS NULL
  ) THEN
    RAISE EXCEPTION 'contract_children.school_id: pozostaly wiersze bez school_id — uzupelnij przed NOT NULL';
  END IF;
END $$;

ALTER TABLE "contract_children" ALTER COLUMN "school_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contract_children_school_id_fkey'
  ) THEN
    ALTER TABLE "contract_children"
      ADD CONSTRAINT "contract_children_school_id_fkey"
      FOREIGN KEY ("school_id") REFERENCES "schools"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_contract_children_school_id"
  ON "contract_children"("school_id");
