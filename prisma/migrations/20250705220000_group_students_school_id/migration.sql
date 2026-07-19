-- Add school_id to group_students (denormalized from groups for school-scoped queries).

ALTER TABLE "group_students" ADD COLUMN "school_id" TEXT;

UPDATE "group_students" gs
SET "school_id" = g."school_id"
FROM "groups" g
WHERE g."id" = gs."group_id";

UPDATE "group_students" gs
SET "school_id" = c."school_id"
FROM "children" c
WHERE gs."school_id" IS NULL
  AND c."id" = gs."child_id";

ALTER TABLE "group_students" ALTER COLUMN "school_id" SET NOT NULL;

CREATE INDEX "idx_group_students_school_id" ON "group_students"("school_id");

ALTER TABLE "group_students" ADD CONSTRAINT "group_students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
