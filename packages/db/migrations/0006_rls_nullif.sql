-- Fail closed when app.current_tenant_id is unset: empty string must not cast to uuid.
-- Policies compare only when the setting is a non-empty UUID string.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
      )
      WITH CHECK (
        nullif(current_setting('app.current_tenant_id', true), '') IS NOT NULL
        AND tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
      )
    $f$, t);
  END LOOP;
END $$;
