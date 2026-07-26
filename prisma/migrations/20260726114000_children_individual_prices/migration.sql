-- Indywidualne stawki na profilu dziecka (źródło prawdy; group_students zostaje lustrem).

ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "lesson_unit_price" DECIMAL(10, 2);
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "monthly_unit_price" DECIMAL(10, 2);
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "yearly_unit_price" DECIMAL(10, 2);

-- Backfill z aktywnego członkostwa w grupie (najnowsze enrolled_at).
UPDATE "children" AS c
SET
  lesson_unit_price = src.lesson_unit_price,
  monthly_unit_price = src.monthly_unit_price,
  yearly_unit_price = src.yearly_unit_price
FROM (
  SELECT DISTINCT ON (gs.child_id)
    gs.child_id,
    gs.lesson_unit_price,
    gs.monthly_unit_price,
    gs.yearly_unit_price
  FROM group_students gs
  WHERE gs.left_at IS NULL
    AND (
      gs.lesson_unit_price IS NOT NULL
      OR gs.monthly_unit_price IS NOT NULL
      OR gs.yearly_unit_price IS NOT NULL
    )
  ORDER BY gs.child_id, gs.enrolled_at DESC
) AS src
WHERE c.id = src.child_id
  AND c.lesson_unit_price IS NULL
  AND c.monthly_unit_price IS NULL
  AND c.yearly_unit_price IS NULL;

-- Uzupełnienie z podpisanej umowy (tylko puste pola na dziecku).
UPDATE "children" AS c
SET
  lesson_unit_price = COALESCE(c.lesson_unit_price, src.lesson_unit_price),
  monthly_unit_price = COALESCE(c.monthly_unit_price, src.monthly_unit_price),
  yearly_unit_price = COALESCE(c.yearly_unit_price, src.yearly_unit_price)
FROM (
  SELECT DISTINCT ON (cc.child_id)
    cc.child_id,
    cc.lesson_unit_price,
    cc.monthly_unit_price,
    cc.yearly_unit_price
  FROM contract_children cc
  JOIN contracts ct ON ct.id = cc.contract_id
  WHERE ct.status = 'SIGNED'
    AND (
      cc.lesson_unit_price IS NOT NULL
      OR cc.monthly_unit_price IS NOT NULL
      OR cc.yearly_unit_price IS NOT NULL
    )
  ORDER BY cc.child_id, ct.signed_at DESC NULLS LAST, ct.created_at DESC
) AS src
WHERE c.id = src.child_id
  AND (
    c.lesson_unit_price IS NULL
    OR c.monthly_unit_price IS NULL
    OR c.yearly_unit_price IS NULL
  );
