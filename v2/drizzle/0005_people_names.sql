ALTER TABLE learners ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS learners_email_unique
  ON learners (lower(email))
  WHERE email IS NOT NULL AND email <> '';

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS display_name text;
