-- Opcjonalny PESEL na użytkowniku (np. lektorzy). Nie wymagany przy rejestracji.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pesel" VARCHAR(11);
