// send-survey — runs hourly, delivers only to orgs whose local send hour is now.
//
// Promotes the day's generated cycles to live and invites everyone in scope on
// their preferred channel, with email alongside. Delivery is recorded in
// survey_deliveries, which is unique on (cycle, user), so a re-run or an
// overlapping cron tick cannot double-message anyone.
//
// survey_deliveries records that we asked, never whether the person answered.
// Who responded is only knowable through the cycle salt, and who skipped is not
// recorded at all — participation has to stay genuinely voluntary.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendOutbound } from "../_shared/whatsapp.ts";
import { sendTemplatedEmail, emailTemplates } from "../_shared/emailer.ts";
import { resolveScopes } from "../_shared/surveySignals.ts";

const DEFAULT_SEND_HOUR = 9;

function localHour(timezone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
  } catch {
    return new Date().getUTCHours();
  }
}

/**
 * Manual mode holds a cycle until an admin approves every question. Auto mode
 * is the default: at a daily cadence, requiring a human to approve five
 * questions every morning means the survey simply never goes out. The
 * prohibited-topic screen in generate-survey is what makes that safe, and
 * admins still get a notification with a cancel link.
 */
function readyToSend(cycle: any, questions: any[], approvalMode: string): boolean {
  if (cycle.status === "live") return true;
  if (cycle.status !== "pending_review") return false;
  if (approvalMode === "manual") {
    return questions.length > 0 && questions.every((q) => q.approved === true);
  }
  return questions.length > 0;
}

async function sendForOrg(db: any, org: any, surveyDate: string): Promise<number> {
  const timezone = org.settings?.timezone ?? "Africa/Nairobi";
  const sendHour = Number(org.settings?.survey_send_hour ?? DEFAULT_SEND_HOUR);
  if (localHour(timezone) !== sendHour) return 0;

  const { data: cycles } = await db
    .from("survey_cycles")
    .select("*")
    .eq("org_id", org.id)
    .eq("survey_date", surveyDate)
    .in("status", ["pending_review", "live"]);

  if (!cycles?.length) return 0;

  const approvalMode = org.settings?.survey_approval ?? "auto";
  const scopes = await resolveScopes(db, org.id);
  let sent = 0;

  for (const cycle of cycles) {
    const { data: questions } = await db
      .from("survey_questions")
      .select("id, approved")
      .eq("cycle_id", cycle.id)
      .order("sort_order");

    const approved = (questions ?? []).filter((q: any) => q.approved !== false);
    if (!readyToSend(cycle, approved, approvalMode)) continue;

    if (cycle.status !== "live") {
      await db
        .from("survey_cycles")
        .update({ status: "live", opened_at: new Date().toISOString() })
        .eq("id", cycle.id);
    }

    const scope = scopes.find(
      (s) => s.scopeType === cycle.scope_type && s.scopeKey === cycle.scope_key,
    );
    if (!scope?.memberIds.length) continue;

    const { data: alreadySent } = await db
      .from("survey_deliveries")
      .select("user_id")
      .eq("cycle_id", cycle.id);
    const skip = new Set((alreadySent ?? []).map((d: any) => d.user_id));

    const pending = scope.memberIds.filter((id) => !skip.has(id));
    if (!pending.length) continue;

    const { data: members } = await db.from("users").select("*").in("id", pending);

    for (const member of members ?? []) {
      const body =
        `Hi ${String(member.full_name ?? "there").split(" ")[0]} — ${approved.length} quick questions ` +
        `about how ${cycle.scope_label} is going. Takes two minutes, and your answers stay private:\n` +
        `${Deno.env.get("PUBLIC_APP_URL") ?? "https://os.jabali.studio"}/surveys/current`;

      let channel = "in_app";
      try {
        const result = await sendOutbound(member, body);
        channel = result.channel;
      } catch {
        // Fall through to email and the in-app notification.
      }

      const { error } = await db.from("survey_deliveries").insert({
        org_id: org.id,
        cycle_id: cycle.id,
        user_id: member.id,
        channel,
      });
      // Unique violation means a concurrent tick already delivered this one.
      if (error) continue;

      const mail = emailTemplates.survey_invite({
        recipient: member,
        scopeLabel: cycle.scope_label,
        questionCount: approved.length,
        cycleId: cycle.id,
      });
      await sendTemplatedEmail(db, {
        orgId: org.id,
        to: member,
        category: "survey",
        template: "survey_invite",
        subject: mail.subject,
        html: mail.html,
        relatedType: "survey_cycle",
        relatedId: cycle.id,
        idempotencyKey: `survey_invite:${cycle.id}:${member.id}`,
      });

      await db.from("notifications").insert({
        org_id: org.id,
        user_id: member.id,
        kind: "system",
        title: `${approved.length} questions about ${cycle.scope_label}`,
        body: "Two minutes. Your individual answers are never shown to your manager.",
        link: "/surveys/current",
      });

      sent++;
    }

    await db
      .from("survey_cycles")
      .update({ invited_count: scope.memberIds.length })
      .eq("id", cycle.id);
  }

  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const surveyDate = body.survey_date ?? new Date().toISOString().slice(0, 10);

  const { data: orgs } = body.org_id
    ? await db.from("organizations").select("id, name, settings").eq("id", body.org_id)
    : await db.from("organizations").select("id, name, settings");

  let sent = 0;
  for (const org of orgs ?? []) {
    if (org.settings?.surveys_enabled === false) continue;
    try {
      sent += await sendForOrg(db, org, surveyDate);
    } catch (_e) {
      // Next tick retries; deliveries are idempotent.
    }
  }

  return json({ sent, survey_date: surveyDate });
});
