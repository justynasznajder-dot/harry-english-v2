-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PDF', 'VIDEO', 'AUDIO', 'IMAGE', 'LINK', 'EXERCISE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('AVATAR', 'BADGE', 'ITEM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('NEW', 'PROPOSED', 'ACCEPTED', 'SIGNED', 'COMPLETED', 'REJECTED', 'NEGOTIATING');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "target_role" VARCHAR(50),
    "published_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "lesson_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_auth" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "child_id" TEXT NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "last_login" TIMESTAMP(6),

    CONSTRAINT "child_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_rewards" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "child_id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "birth_date" DATE NOT NULL,
    "avatar_url" TEXT,
    "xp_total" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "resignation_requested" BOOLEAN NOT NULL DEFAULT false,
    "resignation_reason" TEXT,
    "resignation_date" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "enrollment_request_id" TEXT,
    "access_level" TEXT NOT NULL DEFAULT 'NEW',

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_children" (
    "contract_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "enrollment_request_id" TEXT,
    "group_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "attachment_1_html" TEXT,
    "attachment_2_html" TEXT,

    CONSTRAINT "contract_children_pkey" PRIMARY KEY ("contract_id","child_id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "content_html" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school_year" VARCHAR(9),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "template_kind" TEXT NOT NULL DEFAULT 'CONTRACT',

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "child_id" TEXT,
    "parent_id" TEXT NOT NULL,
    "group_id" TEXT,
    "template_id" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(6),
    "signed_at" TIMESTAMP(6),
    "signed_ip" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school_year_id" TEXT,
    "payment_type" TEXT,
    "amount" DECIMAL,
    "payment_due_day" INTEGER,
    "enrollment_request_id" TEXT,
    "attachment_1_html" TEXT,
    "attachment_2_html" TEXT,
    "include_attachment_2" BOOLEAN NOT NULL DEFAULT false,
    "discount_large_family" BOOLEAN NOT NULL DEFAULT false,
    "discount_sibling" BOOLEAN NOT NULL DEFAULT false,
    "billing_exempt" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_requests" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "parent_first_name" VARCHAR(100) NOT NULL,
    "parent_last_name" VARCHAR(100) NOT NULL,
    "parent_email" VARCHAR(255) NOT NULL,
    "parent_phone" VARCHAR(50),
    "child_first_name" VARCHAR(100) NOT NULL,
    "child_last_name" VARCHAR(100) NOT NULL,
    "child_birth_date" DATE NOT NULL,
    "preferred_location" VARCHAR(100),
    "preferred_days" TEXT,
    "notes" TEXT,
    "status" "enrollment_status" NOT NULL DEFAULT 'NEW',
    "proposed_group_id" TEXT,
    "proposed_at" TIMESTAMP(6),
    "accepted_at" TIMESTAMP(6),
    "user_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejected_at" TIMESTAMP(6),

    CONSTRAINT "enrollment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_materials" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "group_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_students" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "group_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "enrolled_at" DATE NOT NULL DEFAULT CURRENT_DATE,
    "left_at" DATE,
    "school_year_id" TEXT,

    CONSTRAINT "group_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "level" VARCHAR(100),
    "max_students" INTEGER NOT NULL DEFAULT 12,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school_year_id" TEXT,
    "location_id" TEXT,
    "price_monthly" DECIMAL(10,2),
    "price_yearly" DECIMAL(10,2),
    "teacher_pickup_consent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "group_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(6) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancellation_reason" TEXT,
    "school_year_id" TEXT,
    "schedule_template_id" TEXT,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "type" "MaterialType" NOT NULL,
    "url" TEXT NOT NULL,
    "level" VARCHAR(100),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "school_id" TEXT,
    "parent_id" TEXT,
    "sender_id" TEXT,
    "sender_role" TEXT,
    "enrollment_request_id" TEXT,
    "content" TEXT,
    "read_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "parent_message_id" TEXT,
    "recipient_id" TEXT,
    "broadcast_id" TEXT,
    "subject" VARCHAR(255),
    "email_status" TEXT DEFAULT 'PENDING',

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_profiles" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "zip_code" VARCHAR(10),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "company_name" VARCHAR(255),
    "nip" VARCHAR(20),
    "pesel" VARCHAR(11),
    "discount_large_family" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "parent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT,
    "child_id" TEXT,
    "parent_id" TEXT,
    "contract_id" TEXT,
    "amount" DECIMAL,
    "status" TEXT,
    "due_date" DATE,
    "paid_at" TIMESTAMP(6),
    "period_month" DATE,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_notes" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "child_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "lesson_id" TEXT,
    "note" TEXT NOT NULL,
    "rating" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewal_proposals" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "renewal_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "proposed_by" TEXT NOT NULL,
    "proposed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(6),
    "rejection_comment" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renewal_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewals" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "season" VARCHAR(20) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "initiated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(6),
    "proposed_group_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "RewardType" NOT NULL,
    "xp_cost" INTEGER NOT NULL DEFAULT 0,
    "asset_url" TEXT,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "group_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "school_year_id" TEXT,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_complimentary_parents" (
    "school_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "parent_email" TEXT,

    CONSTRAINT "school_complimentary_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_discount_settings" (
    "school_id" TEXT NOT NULL,
    "discount_key" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_discount_settings_pkey" PRIMARY KEY ("school_id","discount_key")
);

-- CreateTable
CREATE TABLE "school_holidays" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school_year_id" TEXT,

    CONSTRAINT "school_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Warsaw',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewals_open" BOOLEAN NOT NULL DEFAULT false,
    "renewals_season" VARCHAR(20),
    "city" VARCHAR(100),

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "price_cents" INTEGER NOT NULL,
    "billing_period" VARCHAR(50) NOT NULL DEFAULT 'MONTHLY',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "school_year_id" TEXT,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(50),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "reset_token" VARCHAR(255),
    "reset_token_expiry" TIMESTAMP(6),
    "resignation_date" TIMESTAMP(6),
    "last_login" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_level" TEXT NOT NULL DEFAULT 'PENDING',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_announcements_school_id" ON "announcements"("school_id");

-- CreateIndex
CREATE INDEX "idx_attendance_child_id" ON "attendance"("child_id");

-- CreateIndex
CREATE INDEX "idx_attendance_lesson_id" ON "attendance"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_lesson_id_child_id_key" ON "attendance"("lesson_id", "child_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_auth_child_id_key" ON "child_auth"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_auth_username_key" ON "child_auth"("username");

-- CreateIndex
CREATE INDEX "idx_child_rewards_child_id" ON "child_rewards"("child_id");

-- CreateIndex
CREATE INDEX "idx_children_parent_id" ON "children"("parent_id");

-- CreateIndex
CREATE INDEX "idx_children_school_id" ON "children"("school_id");

-- CreateIndex
CREATE INDEX "idx_contract_children_child" ON "contract_children"("child_id");

-- CreateIndex
CREATE INDEX "contract_templates_school_kind_year_idx" ON "contract_templates"("school_id", "template_kind", "school_year") WHERE (active = true);

-- CreateIndex
CREATE INDEX "idx_contract_templates_school_id" ON "contract_templates"("school_id");

-- CreateIndex
CREATE INDEX "contracts_enrollment_request_id_idx" ON "contracts"("enrollment_request_id");

-- CreateIndex
CREATE INDEX "idx_contracts_child_id" ON "contracts"("child_id");

-- CreateIndex
CREATE INDEX "idx_contracts_parent_id" ON "contracts"("parent_id");

-- CreateIndex
CREATE INDEX "idx_contracts_status" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "idx_enrollment_requests_email" ON "enrollment_requests"("parent_email");

-- CreateIndex
CREATE INDEX "idx_enrollment_requests_school_id" ON "enrollment_requests"("school_id");

-- CreateIndex
CREATE INDEX "idx_enrollment_requests_status" ON "enrollment_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "group_materials_group_id_material_id_key" ON "group_materials"("group_id", "material_id");

-- CreateIndex
CREATE INDEX "idx_group_students_child_id" ON "group_students"("child_id");

-- CreateIndex
CREATE INDEX "idx_group_students_group_id" ON "group_students"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_students_group_id_child_id_key" ON "group_students"("group_id", "child_id");

-- CreateIndex
CREATE INDEX "idx_groups_school_id" ON "groups"("school_id");

-- CreateIndex
CREATE INDEX "idx_groups_school_year_id" ON "groups"("school_year_id");

-- CreateIndex
CREATE INDEX "idx_groups_teacher_id" ON "groups"("teacher_id");

-- CreateIndex
CREATE INDEX "idx_lessons_group_id" ON "lessons"("group_id");

-- CreateIndex
CREATE INDEX "idx_lessons_schedule_template_id" ON "lessons"("schedule_template_id");

-- CreateIndex
CREATE INDEX "idx_lessons_scheduled_at" ON "lessons"("scheduled_at");

-- CreateIndex
CREATE INDEX "idx_lessons_school_year_id" ON "lessons"("school_year_id");

-- CreateIndex
CREATE INDEX "idx_locations_school_id" ON "locations"("school_id");

-- CreateIndex
CREATE INDEX "idx_materials_school_id" ON "materials"("school_id");

-- CreateIndex
CREATE INDEX "idx_messages_broadcast" ON "messages"("broadcast_id");

-- CreateIndex
CREATE INDEX "idx_messages_parent" ON "messages"("parent_message_id");

-- CreateIndex
CREATE INDEX "idx_messages_recipient" ON "messages"("recipient_id");

-- CreateIndex
CREATE INDEX "idx_progress_notes_child_id" ON "progress_notes"("child_id");

-- CreateIndex
CREATE INDEX "idx_progress_notes_teacher_id" ON "progress_notes"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_renewal_proposals_one_pending" ON "renewal_proposals"("renewal_id") WHERE (status = 'PENDING'::text);

-- CreateIndex
CREATE INDEX "idx_renewal_proposals_renewal" ON "renewal_proposals"("renewal_id");

-- CreateIndex
CREATE INDEX "idx_renewals_parent" ON "renewals"("parent_id");

-- CreateIndex
CREATE INDEX "idx_renewals_school" ON "renewals"("school_id");

-- CreateIndex
CREATE INDEX "idx_renewals_status" ON "renewals"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_renewals_child_season" ON "renewals"("child_id", "season");

-- CreateIndex
CREATE INDEX "idx_rewards_school_id" ON "rewards"("school_id");

-- CreateIndex
CREATE INDEX "idx_schedule_templates_group_id" ON "schedule_templates"("group_id");

-- CreateIndex
CREATE INDEX "idx_school_complimentary_parents_parent" ON "school_complimentary_parents"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_school_complimentary_parents_user" ON "school_complimentary_parents"("school_id", "parent_id") WHERE (parent_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_school_holidays_date" ON "school_holidays"("date_from", "date_to");

-- CreateIndex
CREATE INDEX "idx_school_holidays_school" ON "school_holidays"("school_id");

-- CreateIndex
CREATE INDEX "idx_school_holidays_school_id" ON "school_holidays"("school_id");

-- CreateIndex
CREATE INDEX "idx_school_holidays_school_year" ON "school_holidays"("school_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_school_years_one_active" ON "school_years"("school_id") WHERE (active = true);

-- CreateIndex
CREATE INDEX "idx_school_years_school_id" ON "school_years"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- CreateIndex
CREATE INDEX "idx_subscriptions_child_id" ON "subscriptions"("child_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_parent_id" ON "subscriptions"("parent_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_school_id" ON "subscriptions"("school_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_school_year_id" ON "subscriptions"("school_year_id");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_reset_token" ON "users"("reset_token");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_users_school_id" ON "users"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_email_key" ON "users"("school_id", "email");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "child_auth" ADD CONSTRAINT "child_auth_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "child_rewards" ADD CONSTRAINT "child_rewards_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "child_rewards" ADD CONSTRAINT "child_rewards_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_enrollment_request_id_fkey" FOREIGN KEY ("enrollment_request_id") REFERENCES "enrollment_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_children" ADD CONSTRAINT "contract_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_children" ADD CONSTRAINT "contract_children_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_children" ADD CONSTRAINT "contract_children_enrollment_request_id_fkey" FOREIGN KEY ("enrollment_request_id") REFERENCES "enrollment_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_children" ADD CONSTRAINT "contract_children_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_proposed_group_id_fkey" FOREIGN KEY ("proposed_group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_materials" ADD CONSTRAINT "group_materials_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_materials" ADD CONSTRAINT "group_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_students" ADD CONSTRAINT "group_students_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_students" ADD CONSTRAINT "group_students_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_students" ADD CONSTRAINT "group_students_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_schedule_template_id_fkey" FOREIGN KEY ("schedule_template_id") REFERENCES "schedule_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_enrollment_request_id_fkey" FOREIGN KEY ("enrollment_request_id") REFERENCES "enrollment_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "progress_notes" ADD CONSTRAINT "progress_notes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewal_proposals" ADD CONSTRAINT "renewal_proposals_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewal_proposals" ADD CONSTRAINT "renewal_proposals_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewal_proposals" ADD CONSTRAINT "renewal_proposals_renewal_id_fkey" FOREIGN KEY ("renewal_id") REFERENCES "renewals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewal_proposals" ADD CONSTRAINT "renewal_proposals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_proposed_group_id_fkey" FOREIGN KEY ("proposed_group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "school_complimentary_parents" ADD CONSTRAINT "school_complimentary_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "school_complimentary_parents" ADD CONSTRAINT "school_complimentary_parents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "school_discount_settings" ADD CONSTRAINT "school_discount_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
