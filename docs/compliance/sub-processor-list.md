# Sub-processor list

**Product:** Loop  
**Version:** 0.1 (scaffold)  
**Change notice:** Customers receive **30 days’ advance notice** of material additions or replacements, with a right to object as set out in the DPA.

| Sub-processor | Purpose | Data categories (typical) | Location(s) |
|---|---|---|---|
| Cloud host (e.g. AWS / GCP / Azure — confirm per env) | Compute, Postgres, Redis, object storage | Application data at rest / in transit | Documented per environment |
| Anthropic | LLM inference (extraction, classification, synthesis) | Sanitized text prompts; roster names/emails | Provider API region |
| Twilio and/or Meta WhatsApp Business | WhatsApp delivery & inbound webhooks | Phone numbers, message bodies, delivery status | Per provider |
| WorkOS | SSO / SCIM (enterprise identity) | User identity attributes, directory events | Per WorkOS |
| Resend | Transactional email (reports, invites) | Email addresses, report content | Per Resend |
| Sentry | Error monitoring | Technical error context; minimize PII | Per Sentry |

## Notes

- Meeting **audio/video is never stored** by Loop (C-2).
- Email body retention is short (purged after extraction per retention schedule).
- This list must stay aligned with production configuration and the customer DPA annex.

## Revision history

| Date | Change | Author |
|---|---|---|
| 2026-08-24 | Initial scaffold | Loop |
