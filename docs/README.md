# Documentation

Current product source of truth: **`design/`**. Older enterprise and UI copies live under **`spec/`** and **`buildguide/`** for history only.

| Folder | What it is |
|--------|------------|
| **[LOOP_SYSTEM_HANDBOOK.md](./LOOP_SYSTEM_HANDBOOK.md)** | **Team handbook** — pitch → constraints → architecture → pages → workflows (PDF-ready for Claude) |
| [design/](./design/) | Locked overhaul specs (`00_OVERHAUL_BRIEF.md` … `11_BUILD_ORDER.md`) |
| [spec/](./spec/) | Enterprise spec v2 copy (formerly `loop-spec/` at repo root) |
| [buildguide/](./buildguide/) | UI / page build guide (formerly `buildguide/` at repo root) |
| [DECISIONS.md](./DECISIONS.md) | Implementation assumptions |
| [audit/AUDIT.md](./audit/AUDIT.md) | Forensic audit of the running codebase |
| [ops/PRODUCTION.md](./ops/PRODUCTION.md) | Pilot / production notes |
| [ops/runbooks/](./ops/runbooks/) | Incident, restore, retention, connection-outage |
| [compliance/](./compliance/) | DPIA / LIA / AI data / sub-processors |
| [research/BORROW_FROM_DANI.md](./research/BORROW_FROM_DANI.md) | Patterns borrowed from DANI (not a product merge) |

SQL that is no longer live lives in `supabase/archive/` (not under `docs/`).

Start here for onboarding: [LOOP_SYSTEM_HANDBOOK.md](./LOOP_SYSTEM_HANDBOOK.md), then [design/00_OVERHAUL_BRIEF.md](./design/00_OVERHAUL_BRIEF.md). The repo root [README.md](../README.md) is the operator quick start only.
