-- Grupy należą do szkoły (nie do roku szkolnego).
-- Historia przypisań pozostaje w group_students.school_year_id + enrolled_at/left_at.

ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_school_year_id_fkey";
DROP INDEX IF EXISTS "idx_groups_school_year_id";
ALTER TABLE "groups" DROP COLUMN IF EXISTS "school_year_id";
