-- Audit hard-delete: zajecia / dni wolne (snapshot JSON).

CREATE TABLE "admin_deletion_logs" (
  "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "school_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" VARCHAR(64) NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_deletion_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_admin_deletion_logs_school_created"
  ON "admin_deletion_logs"("school_id", "created_at");

CREATE INDEX "idx_admin_deletion_logs_action_created"
  ON "admin_deletion_logs"("action", "created_at");

ALTER TABLE "admin_deletion_logs"
  ADD CONSTRAINT "admin_deletion_logs_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "admin_deletion_logs"
  ADD CONSTRAINT "admin_deletion_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;