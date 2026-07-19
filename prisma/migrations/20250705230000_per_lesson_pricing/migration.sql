-- PER_LESSON pricing: group rates, per-child overrides, monthly billing periods.

ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "price_per_lesson" DECIMAL(10, 2);

ALTER TABLE "enrollment_requests" ADD COLUMN IF NOT EXISTS "lesson_unit_price" DECIMAL(10, 2);

ALTER TABLE "group_students" ADD COLUMN IF NOT EXISTS "lesson_unit_price" DECIMAL(10, 2);

ALTER TABLE "contract_children" ADD COLUMN IF NOT EXISTS "lesson_unit_price" DECIMAL(10, 2);

CREATE TABLE IF NOT EXISTS "lesson_billing_periods" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "period_month" DATE NOT NULL,
    "lessons_count" INTEGER,
    "amount" DECIMAL(10, 2) NOT NULL,
    "unit_price" DECIMAL(10, 2),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "entered_by" TEXT,
    "entered_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "payment_id" TEXT,

    CONSTRAINT "lesson_billing_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_billing_periods_child_month_key"
  ON "lesson_billing_periods"("child_id", "period_month");

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_billing_periods_payment_id_key"
  ON "lesson_billing_periods"("payment_id")
  WHERE "payment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_lesson_billing_school_month"
  ON "lesson_billing_periods"("school_id", "period_month");

CREATE INDEX IF NOT EXISTS "idx_lesson_billing_parent"
  ON "lesson_billing_periods"("parent_id");

CREATE INDEX IF NOT EXISTS "idx_lesson_billing_contract"
  ON "lesson_billing_periods"("contract_id");

ALTER TABLE "lesson_billing_periods" ADD CONSTRAINT "lesson_billing_periods_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lesson_billing_periods" ADD CONSTRAINT "lesson_billing_periods_child_id_fkey"
  FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lesson_billing_periods" ADD CONSTRAINT "lesson_billing_periods_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lesson_billing_periods" ADD CONSTRAINT "lesson_billing_periods_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lesson_billing_periods" ADD CONSTRAINT "lesson_billing_periods_entered_by_fkey"
  FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "lesson_billing_periods" ADD CONSTRAINT "lesson_billing_periods_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
