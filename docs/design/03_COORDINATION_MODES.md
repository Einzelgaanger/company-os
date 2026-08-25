# 03 — Coordination Modes

## 3.1 The idea

Loop v2 had one behaviour, and that behaviour implicitly assumed a small creative consultancy — informal, fast, peer-to-peer, everyone reachable on WhatsApp. Deployed unchanged into a bank's operations team or a law firm, it would be wrong in a way that no amount of configuration would fix, because the wrongness is in the *coordination model*, not the settings.

Organizations coordinate work through a small number of distinct mechanisms: **mutual adjustment** (informal communication between the people doing the work), **direct supervision** (one person directs others), and standardization of **work processes**, of **outputs**, or of **skills**. Which mechanism dominates is not a matter of taste — it follows from the work's complexity and the organization's size and environment, and it is the thing that varies most across industries.

**This is the cross-industry variable.** Not sector, not headcount, not software stack. A 40-person architecture practice and a 40-person marketing agency coordinate almost identically. A 40-person architecture practice and a 40-person payments-operations team do not.

So: `tenant_settings.coordination_mode` is a first-class setting, chosen during onboarding, that changes the product's behaviour throughout.

---

## 3.2 The five modes

| Mode | Coordinated by | Typical organization | What Loop is *for* here |
|---|---|---|---|
| `mutual_adjustment` | Informal communication among peers | Agencies, consultancies, studios, startups, R&D groups, product teams | Accelerating informal coordination — finding who to ask, and asking for you |
| `direct_supervision` | One principal directing others | Owner-led small businesses, founding teams, single-partner practices | Keeping the one decision-maker unblocked and surfacing only what needs them |
| `standardized_process` | Defined procedures | Operations, back office, manufacturing, claims, logistics, shared services | Detecting deviation from a defined process, and where the process stalls |
| `standardized_outputs` | Measured deliverables per unit | Multi-division companies, franchise groups, holding structures | Rolling up output variance per division without touching intra-division work |
| `standardized_skills` | Trained professional judgement | Law, medicine, audit, engineering practices, universities | Tracking only cross-boundary commitments; never touching how the professional works |

**Default:** `mutual_adjustment` for tenants under 50 people, `standardized_process` above 250 unless the admin says otherwise. Between those, ask.

---

## 3.3 What each mode actually changes

This is the implementation table. Every row is a real code path.

| Behaviour | `mutual_adjustment` | `direct_supervision` | `standardized_process` | `standardized_outputs` | `standardized_skills` |
|---|---|---|---|---|---|
| **Check-in cadence** | Frequent, light — every 3–4 working days on active items | Only when the principal is the blocker or the decision | **Exception-only.** Never periodic. Ask only when an item deviates from its expected step time | At deliverable boundaries only | Rare. Only items owed *across* a professional boundary |
| **Check-in register** | Colloquial, first-name, contractions | Terse, action-oriented | Neutral, procedural, references the process step | Formal, references the deliverable | Formal, deferential, references the matter/case not the person's work |
| **Who is asked** | The owner directly | The owner, but escalation always reaches the principal | The step owner, per the process definition | The division's accountable person | The coordinator or practice manager, **not** the professional, unless the item is theirs personally |
| **Escalation trigger** | Blocked, or waiting > 2 working days | Any item the principal has not decided in 1 day | Step exceeds its defined SLA | Deliverable variance beyond threshold | Item crosses its committed date, once, with no repeat |
| **Escalation route** | Peer with the relevant ownership; fast, lateral | Always the principal | The process owner for that step | Division head | Practice/matter coordinator. **Never** a supervisor of a professional's judgement |
| **Escalation tone** | "Can you help unblock this?" | "Needs your call." | "Step X has exceeded its SLA." | "Deliverable Y is behind plan." | "Item Z is past its committed date. Who should take it?" |
| **Default ownership map** | Seeded by topic keyword | Every category → the principal | Seeded by process step | Seeded by division | Seeded by matter type, routed to coordinators |
| **Report emphasis** | Flow: waiting time, blockers, where handoffs stall | Decision queue: what awaits the principal | Process conformance: step cycle times, SLA breaches | Output variance per division | Client/matter commitments and dates only |
| **Aging thresholds** | Aggressive (amber at 2 days, red at 4) | Very aggressive (amber at 1 day) | Per step, from the process definition | Per deliverable cadence | Lenient (amber at 5 days) — professional work is lumpier |
| **Survey topics** | Blockers, clarity, dependencies | Decision latency, clarity | Process friction, tooling, handoffs | Resourcing, dependencies between divisions | Administrative load, information availability |
| **Extraction aggressiveness** | High — catch informal commitments in conversation | Medium | **Low** — only commitments tied to a defined process step | Medium, deliverable-shaped | **Low** — high precision required; a false commitment addressed to a partner is expensive |

---

## 3.4 The `standardized_skills` case deserves care

Professional bureaucracies — law firms, hospitals, audit practices, engineering consultancies — coordinate through trained judgement. The professional decides how the work is done; the organization standardizes *who is qualified*, not *what they do*.

A tool that nudges a partner about their own work reads as an insult and will be turned off in a week. This is the fastest way for Loop to fail in the highest-value market it has.

**Hard rules in this mode:**
- Loop never asks a professional about the *conduct* of their own work.
- Loop only tracks commitments **owed to another party** — a client, another team, a court, a regulator — and only prompts about those.
- Escalation goes to a coordinator whose job is unblocking, never to someone who might be read as supervising professional judgement.
- The word "overdue" does not appear. "Past committed date" does.
- Check-in frequency defaults to at most once per item per week.

Get this right and Loop is sellable into professional services, which is a large, high-value, chronically under-tooled market. Get it wrong and it is unsellable there permanently, because the first impression is the whole impression.

---

## 3.5 Implementation

**Schema:** `tenant_settings.coordination_mode text NOT NULL DEFAULT 'mutual_adjustment' CHECK (coordination_mode IN ('mutual_adjustment','direct_supervision','standardized_process','standardized_outputs','standardized_skills'))`

**Code:** a single module `packages/shared/src/coordination.ts` exporting one profile object per mode:

```ts
export type CoordinationProfile = {
  mode: CoordinationMode;
  checkin: {
    strategy: 'periodic' | 'exception_only' | 'boundary_only';
    intervalWorkingDays: number | null;
    maxPerItemPerWeek: number;
    register: 'colloquial' | 'terse' | 'procedural' | 'formal';
  };
  aging: { amberDays: number; redDays: number; source: 'fixed' | 'process_step' };
  escalation: {
    trigger: 'blocked_or_waiting' | 'undecided' | 'sla_breach' | 'variance' | 'past_committed';
    route: 'topic_owner' | 'principal' | 'process_owner' | 'division_head' | 'coordinator';
    allowSupervisoryRoute: boolean;   // false for standardized_skills
  };
  extraction: { minConfidence: number; scope: 'all' | 'process_linked' | 'cross_boundary_only' };
  report: { sections: ReportSection[] };
  vocabulary: Record<string, string>;  // e.g. { overdue: 'past committed date' }
};
```

**Every consumer reads the profile. No consumer hardcodes a number.** Specifically: the scheduler's check-in eligibility, the aging computation in `04_FLOW_ENGINE.md`, the escalation engine, the message template selection in `05_CONVERSATION.md`, the survey generator, and the report renderer.

**Vocabulary substitution:** the `vocabulary` map is applied at render time to both UI copy and message templates. This is how "overdue" becomes "past committed date" in a law firm without forking the templates. Keys are defined in `07_DESIGN_SYSTEM.md` §7.8.

**Test:** for each of the five modes, a snapshot test asserting that a fixed set of five commitments produces different check-in schedules, different escalation routes, and different report sections. If two modes produce identical output for that fixture, the feature is not implemented.

---

## 3.6 Choosing the mode at onboarding

A new page, `/onboarding/coordination`, placed after compliance and before profile. Do not ask "what is your coordination mechanism" — nobody knows what that means.

Ask three plain questions and infer:

**1. "When someone on your team needs a decision, what usually happens?"**
- They just talk to whoever's involved → `mutual_adjustment`
- It goes to one person who decides → `direct_supervision`
- There's a defined process or approval chain → `standardized_process`
- Each unit decides for itself → `standardized_outputs`

**2. "How much of your team's work follows a defined, repeatable procedure?"**
- Almost none, every job is different → reinforces `mutual_adjustment` / `standardized_skills`
- Some of it → neutral
- Most of it → reinforces `standardized_process`

**3. "Are most of your team qualified professionals who decide how their own work gets done?"** (lawyers, doctors, engineers, accountants, architects)
- Yes → `standardized_skills` overrides the above
- No → keep the inference

Show the inferred mode with a one-line description and a "change this" link listing all five. Store `coordination_mode` plus `coordination_mode_source` (`inferred` | `chosen`) for later analysis of whether the inference is any good.

**Changeable later** at `/settings/coordination`, with a warning that it changes check-in behaviour and a preview of what will change.
