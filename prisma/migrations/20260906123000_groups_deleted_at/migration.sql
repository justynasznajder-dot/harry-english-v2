-- Soft-delete z widoku szkoły (osobno od active).
-- active = nieaktywna grupa (nadal widoczna w panelu managera)
-- deleted_at IS NOT NULL = usunięta z widoku (historia w bazie)

ALTER TABLE "groups" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_groups_school_deleted_at" ON "groups"("school_id", "deleted_at");
