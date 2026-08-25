-- A3: legal records are DB-only.
-- Messaging approval queue moves out of browser storage into a tenant-scoped table.

CREATE TABLE IF NOT EXISTS message_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  template_key      text NOT NULL,
  preview           text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','sent')),
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_approvals_tenant_status
  ON message_approvals (tenant_id, status);

-- Notice acknowledgement is read on every send-eligibility check.
CREATE INDEX IF NOT EXISTS users_notice_ack
  ON users (tenant_id, notice_acknowledged_at);

-- RLS for new tenant_id tables (same DO-block pattern as 0002).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
      AND c.table_name IN ('message_approvals')
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
