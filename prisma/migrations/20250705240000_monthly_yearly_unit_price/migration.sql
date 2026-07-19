-- Indywidualne override stawek miesięcznej i rocznej (jak lesson_unit_price).

ALTER TABLE "enrollment_requests" ADD COLUMN IF NOT EXISTS "monthly_unit_price" DECIMAL(10, 2);
ALTER TABLE "enrollment_requests" ADD COLUMN IF NOT EXISTS "yearly_unit_price" DECIMAL(10, 2);

ALTER TABLE "contract_children" ADD COLUMN IF NOT EXISTS "monthly_unit_price" DECIMAL(10, 2);
ALTER TABLE "contract_children" ADD COLUMN IF NOT EXISTS "yearly_unit_price" DECIMAL(10, 2);

ALTER TABLE "group_students" ADD COLUMN IF NOT EXISTS "monthly_unit_price" DECIMAL(10, 2);
ALTER TABLE "group_students" ADD COLUMN IF NOT EXISTS "yearly_unit_price" DECIMAL(10, 2);
