-- Opcjonalny numer dowodu osobistego na użytkowniku (np. lektorzy).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_card_number" VARCHAR(32);
