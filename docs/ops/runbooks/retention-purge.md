# Retention purge

Nightly housekeeping job `retention-purge` (03:00 UTC stub; per-tenant TZ later).

## Policy

From `tenant_settings`:

- `messages_retention_months` (default 12)
- `transcripts_retention_months` (default 12)

## Procedure

1. Worker computes cutoffs via `processRetentionPurge`.
2. DELETE messages / source_messages / meetings older than cutoff **inside** `withTenantContext`.
3. Never delete audit_log or compliance attestation rows.
4. Emit `audit_log` action `retention.purge` with counts.

## Verify

- Dry-run: set `RETENTION_DRY_RUN=true` — log counts only.
- Spot-check one tenant: row counts before/after for a known old fixture.

## Credentials

Live DB required for execution; offline build computes cutoffs only.
