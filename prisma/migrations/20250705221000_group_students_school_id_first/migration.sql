-- Reorder group_students columns: school_id immediately after id (PostgreSQL has no ALTER COLUMN FIRST).

CREATE TABLE "group_students_new" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "school_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "enrolled_at" DATE NOT NULL DEFAULT CURRENT_DATE,
    "left_at" DATE,
    "school_year_id" TEXT,

    CONSTRAINT "group_students_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "group_students_new" (
    "id",
    "school_id",
    "group_id",
    "child_id",
    "enrolled_at",
    "left_at",
    "school_year_id"
)
SELECT
    "id",
    "school_id",
    "group_id",
    "child_id",
    "enrolled_at",
    "left_at",
    "school_year_id"
FROM "group_students";

DROP TABLE "group_students";

ALTER TABLE "group_students_new" RENAME TO "group_students";

ALTER TABLE "group_students" RENAME CONSTRAINT "group_students_new_pkey" TO "group_students_pkey";

CREATE UNIQUE INDEX "group_students_group_id_child_id_key" ON "group_students"("group_id", "child_id");

CREATE INDEX "idx_group_students_child_id" ON "group_students"("child_id");

CREATE INDEX "idx_group_students_group_id" ON "group_students"("group_id");

CREATE INDEX "idx_group_students_school_id" ON "group_students"("school_id");

ALTER TABLE "group_students" ADD CONSTRAINT "group_students_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "group_students" ADD CONSTRAINT "group_students_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "group_students" ADD CONSTRAINT "group_students_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "group_students" ADD CONSTRAINT "group_students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
