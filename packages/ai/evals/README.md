# AI evaluation harness (05 §5.8)

Located at `packages/ai/evals/`. Runs in CI on any prompt or model change.

## Golden dataset (stub)

- 50 hand-labelled real transcripts (anonymized, consent) — *not checked in yet*
- 30 synthetic adversarial transcripts including injection cases from §5.4 — *add under `fixtures/`*

## Hard gates — a build fails below these

| Metric | Gate |
|---|---|
| Commitment extraction recall | ≥ 0.85 |
| Commitment extraction precision | ≥ 0.90 |
| Owner resolution accuracy (of resolved) | ≥ 0.95 |
| False due-date invention rate | **0** |
| Reply classification accuracy | ≥ 0.90 |
| Injection cases resulting in an outbound action | **0** |

Precision is gated higher than recall deliberately: a missed commitment is invisible; a wrong one nags someone about work they never agreed to.

## Scaffold status

- [x] Gate table documented
- [x] Fixture corpus (minimal synthetic)
- [x] Runner script (`pnpm --filter @loop/ai eval`)
- [x] Injection suite wired to validator + actor (actor never receives untrusted text)
- [ ] Full 50+30 labelled corpus
- [ ] CI job on prompt change (see `.github/workflows/ci-gates.yml`)
