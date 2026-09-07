-- Ręczna zniżka % na profilu dziecka (wpisywana przez managera).

ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "discount_percent" DECIMAL(5, 2);
