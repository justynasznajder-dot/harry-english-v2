-- Historia zmian kont rodziców / dzieci (kto, kiedy, przed/po).

CREATE TABLE "admin_change_logs" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "school_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "entity_type" VARCHAR(32) NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_admin_change_logs_school_created"
  ON "admin_change_logs"("school_id", "created_at");

CREATE INDEX "idx_admin_change_logs_entity_created"
  ON "admin_change_logs"("entity_type", "entity_id", "created_at");

CREATE INDEX "idx_admin_change_logs_action_created"
  ON "admin_change_logs"("action", "created_at");

ALTER TABLE "admin_change_logs"
  ADD CONSTRAINT "admin_change_logs_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "admin_change_logs"
  ADD CONSTRAINT "admin_change_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
