-- Usunięcie tabeli historii propozycji (flow opiera się wyłącznie na enrollment_requests).
-- Uruchom po wdrożeniu kodu bez odwołań do enrollment_proposals.

DROP TABLE IF EXISTS enrollment_proposals CASCADE;
