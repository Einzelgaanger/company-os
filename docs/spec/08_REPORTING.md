# 08 — Reporting

## 8.1 What ships

A **weekly PDF, emailed** to configured recipients, covering: project progress percentages, project statuses, open issues and blockers, escalations, organizational friction, and aggregate team themes. Optionally a shorter daily digest.

The report is generated from database state, not narrated by a model. A model writes **only** the summary prose and theme paraphrases; every number is computed in SQL. This matters: a hallucinated percentage in a document the CEO reads is unrecoverable.

---

## 8.2 Progress percentage — the calculation

Three sources, in priority order. Always show which was used; never present an inferred number as if it were reported.

### Commitment progress (`commitments.progress_pct`)
1. **Self-reported** (highest trust) — from a check-in reply classified with `progress_pct`. Also settable in the web app.
2. **Status-derived** — when nothing is self-reported:
   | Status | Implied % |
   |---|---|
   | `open` / `not_started` | 0 |
   | `in_progress` | 50 |
   | `blocked` / `at_risk` | last reported, or 50 |
   | `done` | 100 |
   | `cancelled` | excluded from all calculations |
3. **Never inferred from elapsed time.** A commitment that is 80% through its window is not 80% done, and presenting it that way manufactures false confidence.

### Project progress (`projects.progress_pct`)

If the project **has milestones**, weight by milestone:
```
progress = Σ(milestone.weight × milestone_completion) / Σ(milestone.weight)

milestone_completion =
  1.0                                   if status = 'done'
  mean(progress_pct of its commitments) if it has commitments
  0.5                                   if status = 'in_progress' with no commitments
  0                                     otherwise
```

If the project has **no milestones**, average commitment progress weighted by priority:
```
weights: critical 4, high 3, medium 2, low 1
progress = Σ(weight × progress_pct) / Σ(weight)
```

Excluded from both: `cancelled` commitments, and commitments with `review_required = true` (unconfirmed extractions must never move a reported number).

**Confidence flag:** if more than 40% of a project's progress comes from status-derived rather than self-reported values, mark the figure `low_confidence` and render it in the report as *"~60% (limited recent updates)"*. An honest hedge is worth more than a confident wrong number.

### Project health
```
off_track   if any critical commitment is overdue, OR >25% of commitments are overdue
at_risk     if any commitment is blocked or escalated, OR >10% overdue,
            OR target_end_date is within 14 days and progress < 70%
on_track    otherwise
unknown     if fewer than 2 commitments, or no activity in 14 days
```
Recompute nightly and on any commitment status change. Store on `projects` with `health_computed_at`.

---

## 8.3 Weekly report structure

Generated Monday at `tenant_settings.report_send_hour` in tenant timezone, covering the previous Mon–Sun.

**Section 1 — Headline** (one short paragraph, `deep` tier, from computed figures only)
> Six of nine active projects are on track. Two escalations opened this week and both were resolved within a day. The recurring theme in team feedback was time lost waiting on data from outside the team.

**Section 2 — Needs your attention**
Ranked table: open escalations (longest first), then overdue critical/high commitments, then projects that moved from `on_track` to `at_risk` this week. Capped at 10 rows — a list nobody finishes is a list nobody reads.

Columns: Item · Project · Owner · Days open · Status · Why it's here

**Section 3 — Project health**
One row per active project: Name · Client · Progress % (with confidence marker) · Change vs last week (▲▼) · Health · Open items · Overdue · Owner

**Section 4 — Work completed this week**
Count plus the 5 most significant by priority. This section exists deliberately: a report that only shows problems trains people to dread it.

**Section 5 — Where time is going**
- Median days from commitment creation to resolution, this week vs the 4-week average.
- **Median days spent in `blocked` state** — this is the single most actionable metric in the report, because it quantifies the referral-chain problem the product exists to solve.
- Escalations by `ownership_map` category (which kinds of blocker recur).
- Count of items still awaiting a first response.

**Section 6 — Team pulse** (only if `survey_aggregates` exists for the period with n ≥ 5)
Exactly the shape in `07_SURVEYS_SENTIMENT.md` §7.7. Omit the entire section when suppressed, with one line: *"Not enough survey responses this week to report without identifying individuals."*

**Section 7 — Data quality**
- Items awaiting human review (low-confidence extractions).
- Connections in an error state.
- Check-in response rate.

This section is a trust device. A report that admits what it doesn't know is believed on the parts it does.

**Footer, on every report — mandatory (C-1):**
> This report describes the status of work items and projects. It is not a measure of individual performance and must not be used as the basis for promotion, discipline, or termination decisions.

---

## 8.4 Recipient scoping

Recipients are configured in `report_recipients` with a `scope`:
- `org` — the full report. Admin/Owner only.
- `team` — sections 2–5 filtered to that team's projects and people. For managers.
- `project` — a single project's rows. For a project owner or an external stakeholder by email.

**Scoping is applied at query time, before rendering.** Never render the full report and then hide sections — a PDF containing hidden data is a data leak waiting for someone to open it in a text editor.

Section 6 (team pulse) appears **only** in `org` scope and in `team` scope where that team has ≥5 respondents.

---

## 8.5 PDF generation

**Pipeline:** `report` queue job → compute `content_json` in SQL → render an HTML template with the data → Playwright `page.pdf()` → upload to S3 → record `pdf_ref` and SHA-256 → enqueue delivery.

**Why Playwright and not a PDF library:** the report is a designed document with tables, colour-coded status, and a chart. HTML + CSS is far easier to iterate on and matches the web view exactly.

**Layout:** A4, 2.0cm margins, page numbers, tenant name and period in a running header.

**Typography and colour:** use the design tokens from `09_UI_PAGES.md` §9.2 so the PDF and the app look like one product.

**Charts:** render server-side to inline SVG (no external image fetches — a PDF that phones out to a chart service leaks data and breaks offline).
- Progress bar per project.
- One 8-week sparkline of median days-to-resolution.

**Determinism:** the same `content_json` must always produce a byte-identical PDF. No timestamps in the body, no random IDs, fixed font versions bundled locally. This makes the SHA-256 meaningful as evidence.

**Accessibility:** tag the PDF (`--export-tagged-pdf`) and ensure status is conveyed by text label as well as colour.

---

## 8.6 Email delivery

**Template:** short. The PDF is the deliverable; the email is a doorway.

```
Subject: Loop weekly — {tenant_name}, week of {period_start}

{first_name},

{headline_paragraph}

  {n} needing attention  ·  {n} projects at risk  ·  {n} completed

Full report attached, or view it in Loop: {link}
```

**Delivery rules:**
- PDF attached **and** linked. Some recipients read email on a phone and want the attachment; some want the live version.
- Attachment size cap 10MB; above that, link only.
- Per-recipient `report_deliveries` row, tracking sent / delivered / bounced / opened.
- **Bounce handling:** two consecutive hard bounces deactivates that recipient and notifies an admin. A silently failing report is worse than no report.
- Retry: 3 attempts, exponential backoff, then mark failed and alert.
- SPF, DKIM, and DMARC configured on the sending domain before launch.

---

## 8.7 Daily digest (optional, off by default)

Enabled via `report_frequency = 'daily_and_weekly'`. In-app and email, **not** WhatsApp — a daily WhatsApp digest to executives burns messaging quota that check-ins need.

Content: what changed in 24 hours — new escalations, newly overdue items, newly completed items, connection failures. No survey data (the cadence is wrong for it), no progress recalculation narrative. Under one screen.

---

## 8.8 On-demand generation

`POST /api/reports/generate` — Admin/Owner only. Rate-limited to 5 per day per tenant. Useful before a board meeting. Marked "Generated on demand" in the header so it is not confused with the scheduled series.

Every generation and every view writes an `audit_log` entry (`report.generated`, `report.viewed`, `report.downloaded`) — reports contain the most sensitive aggregate view of the business, and access to them should be reviewable.
