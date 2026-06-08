-- Zgoda na odebranie dziecka przez lektora — ustawiana per grupa w panelu managera.
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS teacher_pickup_consent BOOLEAN NOT NULL DEFAULT FALSE;
