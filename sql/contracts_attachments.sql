-- Szablony załączników (rodzaj) oraz wygenerowany HTML załączników na umowie.

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS template_kind TEXT NOT NULL DEFAULT 'CONTRACT';

UPDATE contract_templates
SET template_kind = 'CONTRACT'
WHERE template_kind IS NULL OR BTRIM(template_kind) = '';

CREATE INDEX IF NOT EXISTS contract_templates_school_kind_year_idx
  ON contract_templates (school_id, template_kind, school_year)
  WHERE active = TRUE;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS attachment_1_html TEXT,
  ADD COLUMN IF NOT EXISTS attachment_2_html TEXT,
  ADD COLUMN IF NOT EXISTS include_attachment_2 BOOLEAN NOT NULL DEFAULT FALSE;
