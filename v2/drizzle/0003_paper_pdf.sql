-- The printed question paper, so an approver can compare it with the student view.

ALTER TABLE paper_bank.source_files ADD COLUMN IF NOT EXISTS pdf bytea;
