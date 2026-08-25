-- B4: coordination modes — 03_COORDINATION_MODES.md §3.2, §3.5, §3.6.
--
-- The cross-industry variable. Every behavioural number the product uses —
-- check-in cadence, aging thresholds, escalation route, extraction confidence,
-- report sections, vocabulary — is read from the profile keyed by this column
-- in `packages/shared/src/coordination.ts`. No consumer hardcodes a number.

-- ─── §3.5 Schema ────────────────────────────────────────────────────────────

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS coordination_mode text NOT NULL DEFAULT 'mutual_adjustment'
    CHECK (coordination_mode IN ('mutual_adjustment','direct_supervision','standardized_process',
                                 'standardized_outputs','standardized_skills')),
  -- §3.6 keeps the provenance so the onboarding inference can be scored later.
  -- 'default' is the third value the doc does not name: a tenant that predates
  -- /onboarding/coordination was never asked, and counting it as 'inferred'
  -- would flatter the inference it never ran.
  ADD COLUMN IF NOT EXISTS coordination_mode_source text NOT NULL DEFAULT 'default'
    CHECK (coordination_mode_source IN ('default','inferred','chosen')),
  ADD COLUMN IF NOT EXISTS coordination_mode_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS coordination_mode_set_by_user_id uuid REFERENCES users(id);

COMMENT ON COLUMN tenant_settings.coordination_mode IS
  'B4 — 03_COORDINATION_MODES §3.2. Read via coordinationProfile() in @loop/shared; never branched on directly.';
COMMENT ON COLUMN tenant_settings.coordination_mode_source IS
  'B4 — §3.6. ''inferred'' from the three onboarding questions, ''chosen'' when the admin overrode it.';

-- A set_at without a source that could produce one is a broken audit trail, and
-- the /settings/coordination preview reads both.
ALTER TABLE tenant_settings
  DROP CONSTRAINT IF EXISTS coordination_mode_source_agrees;
ALTER TABLE tenant_settings
  ADD CONSTRAINT coordination_mode_source_agrees
    CHECK ((coordination_mode_source = 'default') = (coordination_mode_set_at IS NULL));

-- ─── §3.4 The standardized_skills hard rule, at the schema level ────────────
-- `allowSupervisoryRoute: false` lives in the profile, but escalations already
-- in flight when a tenant switches into standardized_skills must not keep a
-- supervisory route. Recorded here so the escalation engine can detect the
-- switch rather than silently continuing an old ladder.
ALTER TABLE escalations
  ADD COLUMN IF NOT EXISTS routed_under_mode text
    CHECK (routed_under_mode IS NULL OR routed_under_mode IN
      ('mutual_adjustment','direct_supervision','standardized_process',
       'standardized_outputs','standardized_skills'));

COMMENT ON COLUMN escalations.routed_under_mode IS
  'B4 — the coordination mode in force when this route was chosen. A mode change invalidates the ladder (§3.4).';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- No new tenant_id tables. tenant_settings and escalations are re-asserted
-- rather than assumed, so an ALTER above cannot leave either without
-- ENABLE + FORCE + tenant_isolation.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema = 'public'
      AND c.table_name IN ('tenant_settings', 'escalations')
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
