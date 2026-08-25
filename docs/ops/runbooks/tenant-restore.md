# Tenant restore (rehearsal)

Phase 6 exit: per-tenant restore rehearsed and timed.

## Preconditions

- Nightly logical dump or PITR of pooled DB.
- Silo tenants: restore from `db_connection_ref` backup.

## Steps (staging)

1. Provision empty tenant schema / DB.
2. Restore dump filtered by `tenant_id` (or whole silo DB).
3. Run migrations if dump is behind.
4. Smoke: login, list commitments, open one report.
5. Record wall-clock time in the restore log.

## Offline note

Without live DB credentials this runbook is documentation-only.
