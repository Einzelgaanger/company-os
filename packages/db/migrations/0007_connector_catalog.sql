-- Connector catalog — widen `connections` to the full provider list and give
-- api_key / webhook connectors somewhere to live. See apps/api/src/lib/providerRegistry.ts
-- (npm run check:connectors keeps this list and that file identical).

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS api_key_enc         bytea,
  ADD COLUMN IF NOT EXISTS last_error_at       timestamptz,
  ADD COLUMN IF NOT EXISTS instance            text,
  ADD COLUMN IF NOT EXISTS webhook_id          text,
  ADD COLUMN IF NOT EXISTS webhook_secret_enc  bytea,
  ADD COLUMN IF NOT EXISTS sync_cursor         jsonb;

COMMENT ON COLUMN connections.api_key_enc IS
  'Envelope-encrypted read credential for api_key connectors. Never returned by any API.';
COMMENT ON COLUMN connections.instance IS
  'Per-customer host: Zendesk subdomain, Shopify shop, Okta org, self-managed GitLab.';
COMMENT ON COLUMN connections.webhook_id IS
  'Opaque per-tenant id in the inbound webhook path. Tenant is resolved from it, never from a body.';

ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_provider_check;
ALTER TABLE connections ADD CONSTRAINT connections_provider_check CHECK (provider IN (
  'gmail','outlook','front',
  'google_calendar','microsoft_calendar','calendly',
  'zoom','google_meet','webex','fathom','gong','loom',
  'slack','teams','google_chat','discord','telegram','whatsapp','twilio',
  'jira','asana','linear','monday','clickup','trello','basecamp','todoist','shortcut',
  'notion','confluence','google_docs','google_sheets','coda','airtable',
  'google_drive','onedrive','sharepoint','dropbox','box',
  'hubspot','salesforce','pipedrive','zoho_crm','docusign',
  'zendesk','intercom','helpscout',
  'github','gitlab','bitbucket','sentry','pagerduty','datadog',
  'figma','miro',
  'greenhouse','gusto','personio',
  'stripe','quickbooks','xero','shopify',
  'mailchimp','sendgrid','typeform','google_forms',
  'google_analytics','mixpanel','amplitude','segment',
  'okta','auth0','workos',
  'zapier','make','n8n'
));

-- Webhook ids are looked up by the webhooks service before a tenant is known,
-- so this index is deliberately not tenant-leading.
CREATE UNIQUE INDEX IF NOT EXISTS connections_webhook_id
  ON connections(webhook_id) WHERE webhook_id IS NOT NULL;

-- Connector audit trail. A revoked connection still has to explain itself.
CREATE TABLE IF NOT EXISTS connection_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  connection_id  uuid REFERENCES connections(id) ON DELETE SET NULL,
  provider       text NOT NULL,
  event          text NOT NULL
                   CHECK (event IN ('authorized','connected','refreshed','refresh_failed',
                                    'disconnected','revoked','sync_failed')),
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  detail         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connection_events_tenant_created
  ON connection_events(tenant_id, created_at DESC);

-- Re-run the isolation loop so the new tenant table is covered.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
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
