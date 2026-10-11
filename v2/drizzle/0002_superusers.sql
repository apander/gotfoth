-- Operator accounts. A superuser is not a family role.

CREATE TABLE superusers (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO superusers(email) VALUES
  ('alasdair.anderson@gmail.com'),
  ('ilovethedoos@gmail.com')
ON CONFLICT (email) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'study_vault_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON superusers TO study_vault_runtime;
  END IF;
END $$;
