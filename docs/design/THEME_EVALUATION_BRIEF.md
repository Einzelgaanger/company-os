# Company OS — Theme Evaluation Brief

**Status:** Superseded by the Theme Refinement Spec (executed).

The advisory brief that lived here asked Claude whether to Keep / Refine / Replace the forest + lime theme. The verdict was **Refine** — keep forest `#0E1F1A`, lime `#D3F36B`, and the C-mark; neutralise greens in the page ground; delete gold; unify muted grey; scope the lime CTA doctrine; swap display type to Instrument Sans; harden `pnpm check:tokens`.

## Current state (post-refine)

| Role | Value |
|------|--------|
| Forest / ink | `#0E1F1A` |
| Lime accent | `#D3F36B` |
| Accent wash | `#F4FBE3` |
| Muted (only) | `#5B6560` |
| App bg | `#F5F5F3` |
| Soft / raised | `#F8F8F7` |
| Ambient | `#EFEFEE` |
| Hairline | `#E5E5E2` |
| Near white | `#F4F5F3` |
| Ready status | `#7B837E` / `#4C524E` / `#F1F2F0` |
| Warning chrome | `waiting` status tokens (gold family deleted) |
| Display font | Instrument Sans |
| UI font | Inter |
| Mono | IBM Plex Mono |

## Sources of truth

- `src/lib/brand.ts`
- `src/lib/tokens.ts`
- `src/index.css` `:root`
- `docs/design/07_DESIGN_SYSTEM.md` §7.3–7.5b
- `scripts/checks/tokens.mjs` (+ `lime-on-dark.json`, `hex-allowlist.json`)

## If evaluating a further change

Do **not** reopen a full palette replace until photography and marketing chrome (anti-tell list in §7.5b) have been addressed. Those are the next levers if the product still feels templated.
