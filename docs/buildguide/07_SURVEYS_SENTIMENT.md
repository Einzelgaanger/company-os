# 07 — Dynamic Surveys and Aggregate Sentiment

> **Read `00_START_HERE.md` §0.2 constraints C-1 and C-2 before implementing anything in this file.** This is the most legally constrained feature in the product. Built as specified, it is compliant and genuinely valuable. Built naively — individual sentiment scores, voice tone analysis, per-person wellbeing tracking — it is a **prohibited practice** under EU AI Act Article 5(1)(f), carrying penalties up to €35M or 7% of global turnover, and it has been in force since February 2025.

---

## 7.1 What this feature is, and is not

**It is:** a recurring, short, AI-generated survey that asks people about **working conditions** — blockers, clarity, resources, process friction — and produces **aggregated, anonymized themes** for leadership so organizational problems surface in week one instead of month six.

**It is not:** an employee mood tracker, a wellbeing score, an engagement rating, or any per-person measure. There is no individual output of any kind.

| Permitted | Prohibited — do not build |
|---|---|
| Aggregate themes across ≥5 respondents | Any individual sentiment score or label surfaced to anyone |
| "Unclear requirements were the most raised blocker this week" | "Alfred's sentiment is negative" |
| Org- and team-level trend over time (team ≥5 people) | Per-person trend over time |
| Text sentiment on answers the person deliberately submitted | Sentiment from voice, video, facial expression, or any biometric signal |
| Themes feeding process improvements | Anything feeding promotion, discipline, or termination decisions |

**Hard architectural consequence:** there is **no API endpoint, no database view, and no UI surface** that returns a sentiment value keyed to a user. Not for admins. Not for owners. Not for Loop support. If such a path exists, the feature is non-compliant regardless of internal policy.

---

## 7.2 Why "dynamic and AI-made" is the right design

Static surveys go stale — people learn the questions and stop reading them. Dynamic generation means each cycle asks about what actually happened, which raises both response rate and signal quality.

**But generation must be bounded.** An unconstrained model writing questions to employees is a compliance and reputation risk. The bounds:

1. Questions are generated from a **fixed topic taxonomy** (§7.3). The model chooses emphasis and phrasing, never the subject matter.
2. Questions must be about **work, process, and conditions** — never about a person, never about how someone feels about a colleague, never about emotional state.
3. **Admin approval before send** in v1 (`survey_questions.approved_by_user_id`). After 3 cycles with no edits, a tenant may enable auto-approval with a 24-hour review window during which an admin can cancel.
4. A **prohibited-topic classifier** runs on generated questions before they reach a human. Anything about emotion, health, personal life, colleagues by name, or political/religious/union matters is rejected and regenerated. Three failures → fall back to the template question set.

---

## 7.3 Topic taxonomy (fixed — the model selects within it, never outside it)

| Topic | Example question shapes |
|---|---|
| `clarity` | How clear were your priorities / requirements this week? |
| `blockers` | What slowed you down most? Is anything still blocking you? |
| `resources` | Did you have what you needed to do your work? |
| `process` | Was any handoff or approval slower than it should have been? |
| `workload` | Was your workload manageable this week? *(workload — not stress, not wellbeing)* |
| `dependencies` | Were you waiting on anyone or anything longer than expected? |
| `tooling` | Did any tool or system get in your way? |
| `information` | Did you have the information you needed, when you needed it? |

**Explicitly excluded topics — the classifier rejects these:** emotional state, mood, morale, stress, burnout, health, satisfaction with management, opinions about named colleagues, personal circumstances, political views, union matters, and anything the person's protected characteristics could be inferred from.

Note that "how are you feeling" is excluded and "was your workload manageable" is included. That distinction is the whole compliance line: **conditions, not feelings.**

---

## 7.4 Survey generation (`deep` tier, batched)

**Trigger:** scheduler enqueues per `tenant_settings.survey_frequency`.

**Input to the model — aggregate context only, never individual history:**
- Topic taxonomy (§7.3)
- Aggregate stats for the period: count of commitments completed / overdue / blocked, count of escalations by category, top 3 `ownership_map` categories triggered
- The **previous cycle's aggregate themes** (so the survey can follow up on what was raised)
- Topics used in the last 3 cycles (to vary)

**Never sent to the model:** any individual's replies, names, message history, or per-person status.

**Output schema:**
```ts
z.object({
  theme: z.string().max(80),
  rationale: z.string().max(300),
  questions: z.array(z.object({
    text: z.string().min(10).max(160),
    type: z.enum(['scale_1_5','open_text','yes_no']),
    topic: z.enum(['clarity','blockers','resources','process','workload',
                   'dependencies','tooling','information']),
  })).min(3).max(5),
}).strict()
```

**Composition rule:** every cycle includes at least one `scale_1_5` (gives a trendable number) and at least one `open_text` (gives the theme material). Never more than 5 questions total.

**Post-generation validation, in order:**
1. Schema validation.
2. Prohibited-topic classifier on each question.
3. Length and reading-level check (aim for plain, short sentences — these are read on a phone).
4. Duplicate check against the last 3 cycles.
5. Route to admin approval queue.

---

## 7.5 Distribution and response collection

- Sent via WhatsApp using `survey_invite` then free-form questions inside the service window (`06_WHATSAPP.md` §6.4.3), and available in the web app at `/surveys/current` for anyone not on WhatsApp.
- **Participation is voluntary.** `SKIP` exits with no record of who skipped, no follow-up, and no effect on anything.
- **No reminder to non-responders in v1.** Chasing survey responses converts a voluntary instrument into a compulsory one, which undermines both the data quality and the legal basis.
- Responses are written with `respondent_hash = HMAC(user_id, cycle_salt)`, where `cycle_salt` is generated per cycle and **destroyed when the cycle closes**. Within a cycle, this allows deduplication and multi-question linking. After close, the mapping is unrecoverable.

---

## 7.6 Aggregation and the minimum-n rule (C-2)

**On cycle close:**

1. Count distinct `respondent_hash`. If **< 5**, set `survey_cycles.status = 'suppressed'`, write **no** `survey_aggregates` row, and show in the UI: *"Not enough responses to report on this cycle without identifying individuals."* This is a feature, not a failure — say so plainly.
2. If ≥ 5, compute aggregates per scope. **A team-level aggregate requires ≥5 respondents from that team**, not ≥5 org-wide. A 4-person team never gets its own aggregate — it rolls up to the org level only.
3. Theme extraction (`deep` tier, batched): send the open-text answers **without any identifiers** and ask for 2–4 recurring themes with a mention count and a **paraphrased** example (never a verbatim quote — a verbatim quote can identify the author by phrasing).
4. Sentiment: classify each open-text answer as positive / neutral / negative, then compute **percentages only**. Store the percentages in `survey_aggregates`.
5. **Purge individual sentiment labels immediately after aggregation:** set `survey_responses.sentiment_label = NULL` and `sentiment_purged_at = now()`. The raw answer text is retained per the retention policy for the person's own DSR access, but the per-person sentiment inference does not persist.
6. Destroy `cycle_salt`.

**Database-enforced backstop:** `survey_aggregates` carries `CHECK (respondent_count >= 5)`. Even a bug in the aggregation code cannot write an aggregate below the threshold.

**Query-layer backstop:** every read path for survey data goes through a single `getSurveyAggregate()` function that refuses to return anything when `respondent_count < 5`. There is no second path.

---

## 7.7 What appears in the weekly report

Exactly this shape, and nothing more granular:

> **Team pulse** — 14 of 22 people responded
>
> Priority clarity: **3.8 / 5** (up from 3.4)
>
> Most raised this week:
> - **Waiting on external data** — raised by 6 people. Several noted requests routed through multiple people before reaching an owner.
> - **Unclear acceptance criteria** — raised by 4 people, mainly on client-facing work.
> - **Tooling access delays** — raised by 3 people.
>
> Overall tone of responses: 21% positive, 50% neutral, 29% negative.

No names. No per-person anything. Themes describe **the work environment**, which is the thing leadership can actually fix.

---

## 7.8 Employee-facing transparency

At `/settings/my-data`, every person sees:
- Every survey they responded to and their own answers, verbatim.
- A plain statement: *"Your individual answers are never shown to your manager, to leadership, or to anyone else. Only combined summaries across at least 5 people are reported."*
- A one-click "Delete my responses to this cycle" that removes their rows and re-runs aggregation (suppressing the cycle if the count drops below 5).

This page is not optional. It is the single most effective control for both legal compliance and employee trust, and without trust the response rate collapses and the feature produces nothing worth reading.
