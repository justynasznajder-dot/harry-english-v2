-- Komentarz managera przy obsłudze zgłoszenia (szczegóły / stawki).

ALTER TABLE "enrollment_requests"
  ADD COLUMN "manager_comment" TEXT;
