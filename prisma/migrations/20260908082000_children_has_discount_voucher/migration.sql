-- Deklaracja rodzica: dziecko ma bon zniżkowy (1. faktura − wartość jednych zajęć).

ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "has_discount_voucher" BOOLEAN NOT NULL DEFAULT false;
