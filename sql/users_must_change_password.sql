-- Wymuszenie zmiany hasła przy pierwszym logowaniu (po wysłaniu propozycji grupy
-- przez admina, dla świeżo utworzonego konta rodzica). Uruchom raz w bazie.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
