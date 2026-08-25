-- A1: local auth password + messaging number registry for webhook tenant resolution.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS messaging_numbers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  e164            text NOT NULL,
  purpose         text NOT NULL DEFAULT 'whatsapp'
                    CHECK (purpose IN ('whatsapp','sms','voice')),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS messaging_numbers_e164 ON messaging_numbers (lower(e164)) WHERE active;
CREATE INDEX IF NOT EXISTS messaging_numbers_tenant ON messaging_numbers (tenant_id);

CREATE TABLE IF NOT EXISTS fathom_webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_id      text NOT NULL UNIQUE,
  secret_hash     text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fathom_webhooks_tenant ON fathom_webhooks (tenant_id);

-- RLS for new tenant_id tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
      AND c.table_name IN ('messaging_numbers', 'fathom_webhooks')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      DROP POLICY IF EXISTS tenant_isolation ON %I;
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    $f$, t, t);
  END LOOP;
END $$;
