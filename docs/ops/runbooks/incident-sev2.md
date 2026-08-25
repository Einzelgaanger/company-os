# Incident Sev-2

Degraded but product usable (partial outage, elevated error rates, single-provider sync failure).

## Criteria

- Single integration provider down for one or more tenants
- WhatsApp send success &lt;95% over 15 minutes
- API p95 &gt; 2s but &lt;5s

## Response

1. Acknowledge in #loop-ops within 30 minutes.
2. Post customer-facing status if &gt;1h.
3. Prefer feature-flag disable (`email_ingestion`, outbound rate) over risky hotfixes.

## Resolve

- Root cause note + follow-up ticket within 2 business days.
