-- Run once as owner; supply the role password through your database console's secret controls.
-- Do not grant this role membership of the owner role. Use it in DATABASE_URL only.
CREATE ROLE study_vault_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO study_vault_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO study_vault_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO study_vault_runtime;
GRANT USAGE ON SCHEMA paper_bank TO study_vault_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA paper_bank TO study_vault_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON v2_migrations FROM study_vault_runtime;
