-- B1: the flow model — 04_FLOW_ENGINE.md §4.2, §4.4, §4.5, §4.6, §4.7, §4.10.
--
-- Additive by design. `commitments.status`, `commitments.due_date` and
-- `commitments.due_date_source` are superseded by `flow_state` / `committed_date`
-- but are left in place and marked deprecated so the API, workers and SPA can be
-- moved over in B2. A later migration drops them once no caller reads them.

-- ─── §4.2 The waiting state machine ─────────────────────────────────────────

ALTER TABLE commitments
  ADD COLUMN IF NOT EXISTS flow_state text NOT NULL DEFAULT 'proposed'
    CHECK (flow_state IN ('proposed','ready','active','waiting_internal','waiting_external',
                          'waiting_decision','waiting_dependency','review','done','cancelled')),
  ADD COLUMN IF NOT EXISTS flow_state_since timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS waiting_on_user_id uuid REFERENCES users(id),
  -- Free text on purpose: most waiting in a consultancy is on someone who will
  -- never be a Loop user (§4.3).
  ADD COLUMN IF NOT EXISTS waiting_on_external_name text,
  ADD COLUMN IF NOT EXISTS waiting_on_commitment_id uuid REFERENCES commitments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_ready_at timestamptz,
  -- §4.5 Cost of delay. Never written by a model.
  ADD COLUMN IF NOT EXISTS cost_of_delay_band text NOT NULL DEFAULT 'standard'
    CHECK (cost_of_delay_band IN ('critical','high','standard','low')),
  ADD COLUMN IF NOT EXISTS cost_of_delay_band_source text NOT NULL DEFAULT 'default'
    CHECK (cost_of_delay_band_source IN ('default','project','manual')),
  -- §4.6 Committed dates. No 'inferred' source exists.
  ADD COLUMN IF NOT EXISTS committed_date date,
  ADD COLUMN IF NOT EXISTS committed_date_source text NOT NULL DEFAULT 'none'
    CHECK (committed_date_source IN ('committed','none')),
  -- §4.10 Corroboration divergence. Flags the item, never the person.
  ADD COLUMN IF NOT EXISTS needs_look boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_look_reason text;

ALTER TABLE commitments
  DROP CONSTRAINT IF EXISTS committed_date_source_agrees;
ALTER TABLE commitments
  ADD CONSTRAINT committed_date_source_agrees
    CHECK ((committed_date_source = 'committed') = (committed_date IS NOT NULL));

COMMENT ON COLUMN commitments.status IS
  'DEPRECATED (B1) — superseded by flow_state. Dropped once no caller reads it.';
COMMENT ON COLUMN commitments.due_date IS
  'DEPRECATED (B1) — superseded by committed_date. Dropped once no caller reads it.';
COMMENT ON COLUMN commitments.due_date_source IS
  'DEPRECATED (B1) — superseded by committed_date_source. No ''inferred'' equivalent.';

CREATE INDEX IF NOT EXISTS commitments_tenant_flow_state
  ON commitments(tenant_id, flow_state, flow_state_since)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS commitments_tenant_waiting_on_user
  ON commitments(tenant_id, waiting_on_user_id, flow_state_since)
  WHERE deleted_at IS NULL AND waiting_on_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commitments_tenant_waiting_dependency
  ON commitments(tenant_id, waiting_on_commitment_id)
  WHERE deleted_at IS NULL AND waiting_on_commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commitments_tenant_committed_date
  ON commitments(tenant_id, committed_date)
  WHERE committed_date IS NOT NULL AND flow_state NOT IN ('done','cancelled');
CREATE INDEX IF NOT EXISTS commitments_tenant_needs_look
  ON commitments(tenant_id, needs_look)
  WHERE deleted_at IS NULL AND needs_look;

-- Every transition. Append-only. This table is the product's memory; every
-- metric derives from it, and commitments.flow_state is only a read cache.
CREATE TABLE IF NOT EXISTS flow_events (
  id                        bigserial PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  commitment_id             uuid NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
  from_state                text
                              CHECK (from_state IS NULL OR from_state IN
                                ('proposed','ready','active','waiting_internal','waiting_external',
                                 'waiting_decision','waiting_dependency','review','done','cancelled')),
  to_state                  text NOT NULL
                              CHECK (to_state IN
                                ('proposed','ready','active','waiting_internal','waiting_external',
                                 'waiting_decision','waiting_dependency','review','done','cancelled')),
  waiting_on_user_id        uuid REFERENCES users(id),
  waiting_on_external_name  text,
  -- Wall-clock seconds in from_state; null on the first event.
  duration_seconds          int,
  -- duration_seconds excluding non-working hours (§4.4). Computed by
  -- workingSecondsBetween in @loop/shared — never by subtraction.
  working_seconds           int,
  source                    text NOT NULL
                              CHECK (source IN ('checkin','manual','extraction','system','corroboration')),
  actor                     text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_events_tenant_commitment
  ON flow_events(tenant_id, commitment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS flow_events_tenant_created
  ON flow_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS flow_events_tenant_to_state
  ON flow_events(tenant_id, to_state, created_at DESC);

-- Append-only enforcement. DELETE stays permitted so commitment cascade and
-- retention jobs still work; UPDATE never has a legitimate caller.
CREATE OR REPLACE FUNCTION flow_events_no_update() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'flow_events is append-only (04_FLOW_ENGINE §4.2)';
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flow_events_immutable ON flow_events;
CREATE TRIGGER flow_events_immutable
  BEFORE UPDATE ON flow_events
  FOR EACH ROW EXECUTE FUNCTION flow_events_no_update();

-- ─── §4.5 Cost-of-delay weights, in SQL for ORDER BY ────────────────────────
-- Durations are never computed in SQL (§4.4), but ordering the waiting register
-- has to happen in the database, so the weight lookup lives here too.
CREATE OR REPLACE FUNCTION cod_weight(band text) RETURNS int AS $fn$
  SELECT CASE band
           WHEN 'critical' THEN 8
           WHEN 'high'     THEN 4
           WHEN 'standard' THEN 2
           WHEN 'low'      THEN 1
           ELSE 2
         END
$fn$ LANGUAGE sql IMMUTABLE STRICT;

-- ─── §4.7 Project buffers and the fever chart ───────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS buffer_days numeric(6,2),
  ADD COLUMN IF NOT EXISTS buffer_method text NOT NULL DEFAULT 'unknown'
    CHECK (buffer_method IN ('explicit','observed_waiting','classical','unknown')),
  ADD COLUMN IF NOT EXISTS buffer_consumed_days numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chain_complete_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fever_zone text NOT NULL DEFAULT 'unknown'
    CHECK (fever_zone IN ('green','amber','red','unknown')),
  ADD COLUMN IF NOT EXISTS fever_computed_at timestamptz,
  -- Set by the project owner; inherited by its commitments (§4.5).
  ADD COLUMN IF NOT EXISTS cost_of_delay_band text NOT NULL DEFAULT 'standard'
    CHECK (cost_of_delay_band IN ('critical','high','standard','low'));

-- ─── §4.4 Public holidays ───────────────────────────────────────────────────
-- Editable at /settings/organization. Never inferred.
CREATE TABLE IF NOT EXISTS tenant_holidays (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  holiday_date  date NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, holiday_date)
);

-- ─── Backfill ───────────────────────────────────────────────────────────────

-- commitments carries FORCE ROW LEVEL SECURITY from 0001, which applies to the
-- table owner as well. Without lifting it, a migration running as a non-superuser
-- owner has no app.current_tenant_id, so every statement below would match zero
-- rows and report success. Restored immediately after, inside the same
-- transaction, so a failure here cannot leave the table unforced.
ALTER TABLE commitments NO FORCE ROW LEVEL SECURITY;

-- v2 collapsed every flavour of waiting into 'blocked', so the reverse mapping
-- cannot recover which one it was. 'blocked' lands on waiting_internal, the most
-- common case; the first check-in re-classifies it. at_risk/overdue/escalated
-- were date-derived annotations rather than states, so they fall back to
-- observed progress instead of a guess.
UPDATE commitments c SET
  flow_state = CASE
    WHEN c.status = 'cancelled' THEN 'cancelled'
    WHEN c.status = 'done' THEN 'done'
    WHEN c.review_required THEN 'proposed'
    WHEN c.status = 'blocked' THEN 'waiting_internal'
    WHEN c.status = 'in_progress' THEN 'active'
    WHEN c.status IN ('at_risk','overdue','escalated') AND c.progress_pct > 0 THEN 'active'
    ELSE 'ready'
  END,
  flow_state_since = COALESCE(c.resolved_at, c.updated_at, c.created_at),
  first_ready_at = CASE WHEN c.review_required THEN NULL ELSE c.created_at END,
  waiting_on_external_name = CASE
    WHEN c.status = 'blocked' AND c.owner_external_name IS NOT NULL THEN c.owner_external_name
    ELSE c.waiting_on_external_name
  END
WHERE NOT EXISTS (SELECT 1 FROM flow_events e WHERE e.commitment_id = c.id);

-- §4.6: only dates a human actually committed to survive. 'inferred' dates were
-- model output and are dropped rather than carried across.
UPDATE commitments SET
  committed_date = due_date,
  committed_date_source = 'committed'
WHERE due_date IS NOT NULL
  AND due_date_source IN ('stated','manual')
  AND committed_date IS NULL;

-- priority was human-set in v2, so carrying it into a band is a translation
-- rather than an inference. 'medium' maps to the 'standard' default already.
UPDATE commitments SET
  cost_of_delay_band = CASE priority
    WHEN 'critical' THEN 'critical'
    WHEN 'high' THEN 'high'
    WHEN 'low' THEN 'low'
    ELSE 'standard'
  END,
  cost_of_delay_band_source = 'manual'
WHERE priority <> 'medium' AND cost_of_delay_band_source = 'default';

-- One opening event per commitment so no item has a state without a history.
INSERT INTO flow_events (tenant_id, commitment_id, from_state, to_state, source, actor, created_at)
SELECT c.tenant_id, c.id, NULL, c.flow_state, 'system', 'migration:0004_flow', c.flow_state_since
FROM commitments c
WHERE NOT EXISTS (SELECT 1 FROM flow_events e WHERE e.commitment_id = c.id);

ALTER TABLE commitments FORCE ROW LEVEL SECURITY;

-- Kenya public holidays for the pilot (Public Holidays Act, Cap. 110).
-- Eid al-Fitr and Eid al-Adha are gazetted annually against the lunar calendar
-- and are deliberately absent — an admin adds them at /settings/organization.
INSERT INTO tenant_holidays (tenant_id, holiday_date, name)
SELECT t.id, h.d, h.n
FROM tenants t
CROSS JOIN (VALUES
  (DATE '2026-01-01', 'New Year''s Day'),
  (DATE '2026-04-03', 'Good Friday'),
  (DATE '2026-04-06', 'Easter Monday'),
  (DATE '2026-05-01', 'Labour Day'),
  (DATE '2026-06-01', 'Madaraka Day'),
  (DATE '2026-10-10', 'Huduma Day'),
  (DATE '2026-10-20', 'Mashujaa Day'),
  (DATE '2026-12-12', 'Jamhuri Day'),
  (DATE '2026-12-25', 'Christmas Day'),
  (DATE '2026-12-26', 'Utamaduni Day'),
  (DATE '2027-01-01', 'New Year''s Day'),
  (DATE '2027-03-26', 'Good Friday'),
  (DATE '2027-03-29', 'Easter Monday'),
  (DATE '2027-05-01', 'Labour Day'),
  (DATE '2027-06-01', 'Madaraka Day'),
  (DATE '2027-10-10', 'Huduma Day'),
  (DATE '2027-10-20', 'Mashujaa Day'),
  (DATE '2027-12-12', 'Jamhuri Day'),
  (DATE '2027-12-25', 'Christmas Day'),
  (DATE '2027-12-26', 'Utamaduni Day')
) AS h(d, n)
ON CONFLICT (tenant_id, holiday_date) DO NOTHING;

-- ─── RLS for new tenant_id tables ───────────────────────────────────────────
-- commitments is re-asserted rather than assumed, so no path through the
-- backfill above can leave it without ENABLE + FORCE + tenant_isolation.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
      AND c.table_name IN ('flow_events', 'tenant_holidays', 'commitments')
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
