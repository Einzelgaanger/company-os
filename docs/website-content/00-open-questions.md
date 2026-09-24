# Open questions (website content revamp)

Log format per brief §11. Append throughout.

### Q1: Primary buyer vs user
- Context: Roles in code are owner, admin, manager, member (`src/lib/types.ts`). Marketing speaks to project managers and operators. Billing UI exists (`SettingsBilling.tsx`) but Stripe path is incomplete.
- Why it matters: Pricing and homepage CTA framing.
- Options: A) Position buyer as ops lead / founder who pays for the workspace B) Position buyer as PM buyer inside larger orgs
- Recommendation: A for now (signup creates workspace).
- Placeholder: `[NEEDS INPUT: confirmed buyer persona and sales motion]`

### Q2: Customer proof
- Context: No testimonials, logos or usage metrics in repo. Seed org "ProDG Studios" is demo only.
- Why it matters: Trust block and metrics strip.
- Options: A) Keep structural claims only (6 beats, 1 owner) B) Add real logos when available
- Recommendation: A until proof exists.
- Placeholder: `[NEEDS INPUT: logos, testimonials, pilot outcomes]`

### Q3: WhatsApp live status for marketing
- Context: WhatsApp UI and Edge paths exist; Meta verification often incomplete. In-app Chat is the launch default (`preferred_channel: in_app`).
- Why it matters: Channel claims on the homepage.
- Options: A) Lead with Chat + Telegram, WhatsApp as optional B) Keep Telegram primary wording
- Recommendation: A (truthful for launch).
- Placeholder used in drafts: Chat and Telegram first; WhatsApp when connected.

### Q4: Pricing page
- Context: No public `/pricing` route. Plans appear as `pilot` in schema.
- Why it matters: Brief asks for pricing plans; page does not exist.
- Options: A) Propose a pricing page (do not create without approval) B) Keep signup-only CTA
- Recommendation: B; propose in Q4 only.
- Placeholder: `[NEEDS INPUT: public pricing decision]`

### Q5: Security page
- Context: Privacy/Terms exist. FORCE RLS and audit patterns exist in code. No public Security page.
- Why it matters: Trust for B2B buyers.
- Options: A) Propose `/security` B) Strengthen Privacy only
- Recommendation: A as proposal only (do not create without approval).

### Q7: Public FAQ block
- Context: Anxiety forces under-addressed; no FAQ component on marketing page.
- Why it matters: Trust / Action scores.
- Options: A) Reuse `mk-narrative` cards for 6 objections B) New section (needs design approval)
- Recommendation: A after approval
- Placeholder: none on live site yet

### Q8: robots.txt missing
- Context: No `public/robots.txt` in repo.
- Why it matters: Crawler policy unknown.
- Options: A) Add allow-all B) Leave until ops decides
- Recommendation: B (do not change crawler policy without approval)
- Placeholder: logged in QA

### Q9: AI model training statement
- Context: Privacy mentions model inference; does not say whether customer data trains models.
- Why it matters: Objection bank + trust.
- Options: A) Add explicit "we do not train on your data" if true B) Keep silent until legal confirms
- Recommendation: B until confirmed
- Placeholder: `[NEEDS INPUT: model training / retention statement]`
