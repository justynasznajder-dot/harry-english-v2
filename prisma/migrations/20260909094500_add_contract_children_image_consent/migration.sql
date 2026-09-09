-- Zgoda na wykorzystanie wizerunku dziecka (decyzja przy podpisie umowy).
-- NULL = nie dotyczy / nieustalone (np. draft, tryb bez umowy).
ALTER TABLE "contract_children"
ADD COLUMN IF NOT EXISTS "image_consent" BOOLEAN;
