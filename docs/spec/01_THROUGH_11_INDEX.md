# Spec map (files 01–11)

Full prose specs were delivered in-chat. This repo implements them in code + `docs/DECISIONS.md`.
Use this map until the long-form markdown is checked in.

| File | Topic | Where it lives in code |
|------|--------|-------------------------|
| `01_ARCHITECTURE.md` | Services, queues, RLS footguns | `apps/*`, `packages/db`, `docs/runbooks/` |
| `02_DATA_MODEL.md` | Schema | `packages/db/migrations/0001_init.sql`, `packages/db/src/schema/` |
| `03_IDENTITY_ACCESS.md` | Authz, compliance, SCIM | `packages/shared/src/authz.ts`, `apps/api` auth/scim/compliance |
| `04_INTEGRATIONS.md` | Calendar, project link, connections | `packages/shared/src/calendar.ts`, `projectLink.ts`, workers |
| `05_AI_PIPELINE.md` | Reader/validator/actor, evals | `packages/ai/` |
| `06_WHATSAPP.md` | Templates, eligibility, STOP | `packages/messaging/` |
| `07_ESCALATIONS.md` | Ownership map routing | `packages/shared/src/escalation.ts`, SPA escalations |
| `08_REPORTING.md` | Progress, surveys, PDF | `packages/shared/src/progress.ts`, surveyAggregate, SPA reports/surveys |
| `09_PRODUCT_UI.md` | UI grammar | `src/` (forest/lime locked in DECISIONS) |
| `10_COMPLIANCE.md` | C-1–C-7, DPIA | `docs/compliance/`, SPA onboarding gates |
| `11_OPS.md` | Runbooks, retention, restore | `docs/runbooks/` |

See also: `00_START_HERE.md`, `12_BUILD_PHASES.md`.
