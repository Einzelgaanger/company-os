# 10 — Reporting

## 10.1 What changes

v2's report led with counts and completion percentages. v3's leads with **where time is going**, because that is the thing a reader can act on and the thing no other tool in their stack tells them.

**Every number is computed in SQL.** A model writes only the headline paragraph and the survey theme paraphrases, and it is given the computed figures rather than the raw data. A hallucinated percentage in a document the CEO reads is unrecoverable.

The audit found the report "downloaded" via `window.print()` and regeneration as a toast. Both become real: server-rendered PDF, stored, hashed, emailed.

---

## 10.2 Structure

Weekly, generated Monday at the tenant's configured hour in the tenant's timezone, covering the previous Monday–Sunday.

**Section 1 — Headline**
One short paragraph from computed figures. Example shape:
> Waiting time fell 18% this week, to 34 team-days. Two escalations opened and both cleared within a day. The largest single delay remains client data requests, which accounted for 40% of all waiting.

**Section 2 — Where time went** *(this is the report's centre of gravity)*
- Total waiting, in team-days, versus the 4-week average
- Split by waiting type: internal, external, decision, dependency
- Top 5 holders by waiting time, named as **teams or roles** where possible
- Median working days from an item entering `ready` to `done`, versus the 4-week average
- **Median time spent waiting as a percentage of total item lifetime** — the single most quotable number Loop produces, and the one that justifies the product's existence in one line

**Section 3 — Needs a decision**
Open escalations and exhausted routes. Item · project · waiting on · working days open · why it is here. Capped at 10.

**Section 4 — Project health**
One row per active project: name · client · fever zone · buffer consumed % · chain complete % · direction versus last week · items waiting. Fever charts inline as small multiples.

**Section 5 — What moved**
Items closed, count plus the five most significant by cost-of-delay band. This section is not decoration — a report that only shows problems trains people to dread opening it.

**Section 6 — Team pulse** *(only when survey n ≥ 5)*
Aggregate themes and sentiment percentages, exactly as specified in the v2 survey rules, which the audit confirms are correctly enforced by a database `CHECK` and by 403 endpoints. Omit the whole section when suppressed, with one line explaining why.

**Section 7 — Data quality**
Items awaiting review · connections in error · check-in response rate (**tenant-wide only, never per person**) · nudge precision by trigger.

A report that admits what it does not know is believed on the parts it does.

**Footer, on every report:**
> This report describes the status of work items and projects. It is not a measure of individual performance and must not be used as the basis for promotion, discipline, or termination decisions.

---

## 10.3 What may never appear

Enforced by `no-personal-metrics.spec.ts` walking the report JSON:

- Any metric keyed to a `user_id`
- Any ranking or comparison of people
- Per-person response rates, completion rates, or on-time percentages
- Named individuals in a context implying fault

**Permitted and encouraged:** naming a **queue** — "6 items waiting on the data team, 41 team-days." That is a map, not a judgement, and it is what the reader needs in order to act.

---

## 10.4 Scoping

| Scope | Sections | Audience |
|---|---|---|
| `org` | 1–7 | Admin, Owner |
| `team` | 1–5, 7 filtered to that team | Managers |
| `project` | 3–5 for one project | Project owner, external stakeholder by email |

**Scoping is applied at query time, before rendering.** Never render the full report and hide sections — a PDF with hidden data is a leak waiting for someone to open it in a text editor.

Section 6 appears only in `org` scope, and in `team` scope where that team has ≥5 respondents.

---

## 10.5 Generation

`report` queue job → compute `content_json` in SQL → render HTML from a template → Playwright `page.pdf()` → upload to object storage → record `pdf_ref` and SHA-256 → enqueue delivery.

**Determinism:** identical `content_json` produces a byte-identical PDF. Bundled fonts, no timestamps in the body, no random IDs. That is what makes the hash meaningful as evidence.

**Charts:** rendered server-side to inline SVG. No external image fetches — a PDF that phones out leaks data and breaks offline.

**A4, tagged for accessibility, status conveyed by label as well as colour.** The report must be readable printed in greyscale, which is how a surprising number of executives actually read it.

---

## 10.6 Delivery

Short email; the PDF is the deliverable.

```
Subject: Loop weekly — {tenant}, week of {date}

{first_name},

{headline_paragraph}

  {n} team-days waiting  ·  {n} needing a decision  ·  {n} closed

Full report attached, or open it in Loop: {link}
```

- Attached **and** linked.
- Per-recipient `report_deliveries` row: sent, delivered, bounced, opened.
- Two consecutive hard bounces deactivates the recipient and notifies an admin. A silently failing report is worse than no report.
- SPF, DKIM, DMARC configured before launch.
- Retry 3×, then mark failed and alert.

---

## 10.7 On demand

`POST /reports/generate` — Admin/Owner, 5 per day per tenant. Marked "Generated on demand" in the header so it is not confused with the scheduled series.

`POST /reports/:id/regenerate` — replaces the audit's toast. Re-renders from current data, keeps the same period, and records both versions.

Every generation, view, and download writes an `audit_log` entry. Reports are the most sensitive aggregate view of the business and access to them should be reviewable.
