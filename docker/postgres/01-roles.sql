-- Runs once as loop_owner on first container boot.
-- Application connects as loop_app (NO BYPASSRLS).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loop_app') THEN
    CREATE ROLE loop_app LOGIN PASSWORD 'loop' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE loop TO loop_app;
GRANT USAGE ON SCHEMA public TO loop_app;

ALTER DEFAULT PRIVILEGES FOR ROLE loop_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE loop_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO loop_app;
