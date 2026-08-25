# Connection outage

Triggered when `connectionHealthFromSync` sets `alert: true` (error/expired, or no successful sync in 6h).

## Detect

- Scheduler: `connection-health` every 30 minutes.
- SPA: banner in AppLayout linking to `/integrations`.

## Mitigate

1. Open Integrations → reconnect OAuth for the provider.
2. Confirm `last_synced_at` advances within one sync cycle.
3. If token refresh fails repeatedly, revoke + re-consent.

## Escalate

If &gt;50% of tenant connections alert: Sev-2 (see incident-sev2.md).
