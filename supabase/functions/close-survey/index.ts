// close-survey — end of day, stop accepting answers and tally respondents.
//
// The per-cycle salt is deliberately NOT destroyed here. Two things still need
// it: the weekly aggregate has to group a week of daily cycles by respondent to
// count distinct people rather than distinct answers, and a person has to be
// able to read back and withdraw their own answers from /settings/my-data.
//
// survey-weekly-report destroys the salts once the week is aggregated. That
// gives a seven-day window in which answers are reversible to their author,
// after which they are permanently anonymous. The transparency page says so
// plainly rather than implying answers stay retrievable forever.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders, audit } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Close anything still open from today or earlier; a missed cron tick should
  // not leave a cycle collecting answers indefinitely.
  const cutoff = body.survey_date ?? new Date().toISOString().slice(0, 10);

  let query = db
    .from("survey_cycles")
    .select("id, org_id, scope_label, survey_date")
    .in("status", ["live", "pending_review"])
    .lte("survey_date", cutoff);
  if (body.org_id) query = query.eq("org_id", body.org_id);

  const { data: cycles } = await query;
  const closed: string[] = [];

  for (const cycle of cycles ?? []) {
    const { data: responses } = await db
      .from("survey_responses")
      .select("respondent_hash")
      .eq("cycle_id", cycle.id);

    const respondents = new Set((responses ?? []).map((r: any) => r.respondent_hash)).size;

    await db
      .from("survey_cycles")
      .update({
        status: "closed",
        respondent_count: respondents,
        closed_at: new Date().toISOString(),
      })
      .eq("id", cycle.id);

    await audit(db, cycle.org_id, "system", "survey.closed", "survey_cycle", cycle.id, {
      respondents,
      survey_date: cycle.survey_date,
    });

    closed.push(cycle.id);
  }

  return json({ closed: closed.length, cycle_ids: closed });
});
