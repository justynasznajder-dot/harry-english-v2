-- Załączniki per dziecko (zgoda na wizerunek, upoważnienie odbioru).

ALTER TABLE contract_children
  ADD COLUMN IF NOT EXISTS attachment_1_html TEXT,
  ADD COLUMN IF NOT EXISTS attachment_2_html TEXT;
