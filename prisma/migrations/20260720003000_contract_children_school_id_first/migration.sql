-- Fizyczna kolejność kolumn: school_id jako pierwsza (PostgreSQL wymaga przebudowy tabeli)

CREATE TABLE "contract_children_new" (
    "school_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "enrollment_request_id" TEXT,
    "group_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "attachment_1_html" TEXT,
    "attachment_2_html" TEXT,
    "lesson_unit_price" DECIMAL(10, 2),
    "monthly_unit_price" DECIMAL(10, 2),
    "yearly_unit_price" DECIMAL(10, 2),
    CONSTRAINT "contract_children_new_pkey" PRIMARY KEY ("contract_id", "child_id")
);

INSERT INTO "contract_children_new" (
    "school_id",
    "contract_id",
    "child_id",
    "enrollment_request_id",
    "group_id",
    "sort_order",
    "attachment_1_html",
    "attachment_2_html",
    "lesson_unit_price",
    "monthly_unit_price",
    "yearly_unit_price"
)
SELECT
    "school_id",
    "contract_id",
    "child_id",
    "enrollment_request_id",
    "group_id",
    "sort_order",
    "attachment_1_html",
    "attachment_2_html",
    "lesson_unit_price",
    "monthly_unit_price",
    "yearly_unit_price"
FROM "contract_children";

DROP TABLE "contract_children";

ALTER TABLE "contract_children_new" RENAME TO "contract_children";
ALTER INDEX "contract_children_new_pkey" RENAME TO "contract_children_pkey";

ALTER TABLE "contract_children"
  ADD CONSTRAINT "contract_children_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "contract_children"
  ADD CONSTRAINT "contract_children_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "contract_children"
  ADD CONSTRAINT "contract_children_child_id_fkey"
  FOREIGN KEY ("child_id") REFERENCES "children"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "contract_children"
  ADD CONSTRAINT "contract_children_enrollment_request_id_fkey"
  FOREIGN KEY ("enrollment_request_id") REFERENCES "enrollment_requests"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "contract_children"
  ADD CONSTRAINT "contract_children_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_contract_children_child" ON "contract_children"("child_id");
CREATE INDEX "idx_contract_children_school_id" ON "contract_children"("school_id");
