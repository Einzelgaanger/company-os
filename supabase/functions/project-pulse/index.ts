// project-pulse — autonomous per-member follow-up on live projects.
//
// Asks each person on a project three things on a rolling cadence: where they
// are, what is in their way, and what they need. Unlike the daily survey this
// is attributed, because it is work status rather than a view of the working
// environment, and a manager is entitled to know who is stuck on what.
//
// Replies are classified in _shared/inboundReply.ts and land back on the
// project_pulses row, which project-progress then turns into the project's
// percent-complete, main blocker and forecast.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendOutbound } from "../_shared/whatsapp.ts";
import { sendTemplatedEmail, emailTemplates } from "../_shared/emailer.ts";

const DAY_MS = 86_400_000;
const DEFAULT_PULSE_HOUR = 10;
/** Total outbound messages a person may receive in a day, shared with send-checkin. */
const DAILY_MESSAGE_CAP = 4;

function localHour(timezone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(
        new Date(),
      ),
    );
  } catch {
    return new Date().getUTCHours();
  }
}

function pulseText(firstName: string, projectName: string, openTitles: string[]): string {
  const work = openTitles.length
    ? `\n\nYou currently have: ${openTitles.slice(0, 3).map((t) => `"${t}"`).join(", ")}.`
    : "";
  return (
    `Hi ${firstName} — quick pulse on *${projectName}*.${work}\n\n` +
    `Three things, in one message is fine:\n` +
    `1. Roughly how far along are you?\n` +
    `2. Anything blocking you?\n` +
    `3. Anything you need from someone else?`
  );
}

async function pulseOrg(db: any, org: any): Promise<number> {
  const timezone = org.settings?.timezone ?? "Africa/Nairobi";
  const pulseHour = Number(org.settings?.pulse_send_hour ?? DEFAULT_PULSE_HOUR);
  if (localHour(timezone) !== pulseHour) return 0;

  const { data: projects } = await db
    .from("projects")
    .select("id, name, pulse_enabled, pulse_interval_days")
    .eq("org_id", org.id)
    .eq("status", "active");

  if (!projects?.length) return 0;

  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data: todaysMessages } = await db
    .from("checkins")
    .select("user_id")
    .eq("org_id", org.id)
    .eq("direction", "outbound")
    .gte("created_at", since);

  const sentToday = new Map<string, number>();
  for (const m of todaysMessages ?? []) {
    sentToday.set(m.user_id, (sentToday.get(m.user_id) ?? 0) + 1);
  }

  let sent = 0;

  for (const project of projects) {
    if (project.pulse_enabled === false) continue;
    const intervalMs = Math.max(1, project.pulse_interval_days ?? 3) * DAY_MS;

    const { data: members } = await db
      .from("project_members")
      .select("user_id, users!inner(*)")
      .eq("project_id", project.id);

    if (!members?.length) continue;

    const { data: recentPulses } = await db
      .from("project_pulses")
      .select("user_id, asked_at, responded_at")
      .eq("project_id", project.id)
      .gte("asked_at", new Date(Date.now() - 14 * DAY_MS).toISOString())
      .order("asked_at", { ascending: false });

    const lastAsked = new Map<string, string>();
    for (const p of recentPulses ?? []) {
      if (!lastAsked.has(p.user_id)) lastAsked.set(p.user_id, p.asked_at);
    }

    for (const row of members) {
      const user = (row as any).users;
      if (!user || user.status !== "active") continue;
      if (user.notification_prefs?.whatsapp_checkins === false) continue;
      if ((sentToday.get(user.id) ?? 0) >= DAILY_MESSAGE_CAP) continue;

      const last = lastAsked.get(user.id);
      if (last && Date.now() - new Date(last).getTime() < intervalMs) continue;

      const { data: openWork } = await db
        .from("commitments")
        .select("title")
        .eq("project_id", project.id)
        .eq("owner_id", user.id)
        .not("status", "eq", "done")
        .limit(3);

      const body = pulseText(
        String(user.full_name ?? "there").split(" ")[0],
        project.name,
        (openWork ?? []).map((c: any) => c.title),
      );

      let channel = "in_app";
      let sid = `INAPP-${crypto.randomUUID().slice(0, 8)}`;
      try {
        const result = await sendOutbound(user, body);
        channel = result.channel;
        sid = result.sid;
      } catch {
        // Still record the ask so the cadence does not stall on a transport blip.
      }

      const { data: checkin } = await db
        .from("checkins")
        .insert({
          org_id: org.id,
          user_id: user.id,
          project_id: project.id,
          commitment_id: null,
          direction: "outbound",
          channel,
          message_type: "project_pulse",
          message_text: body,
          twilio_sid: sid,
        })
        .select("id")
        .single();

      await db.from("project_pulses").insert({
        org_id: org.id,
        project_id: project.id,
        user_id: user.id,
        asked_checkin_id: checkin?.id ?? null,
      });

      const mail = emailTemplates.project_pulse({
        recipient: user,
        projectName: project.name,
        projectId: project.id,
      });
      await sendTemplatedEmail(db, {
        orgId: org.id,
        to: user,
        category: "project_pulse",
        template: "project_pulse",
        subject: mail.subject,
        html: mail.html,
        relatedType: "project",
        relatedId: project.id,
        idempotencyKey: `pulse:${project.id}:${user.id}:${new Date().toISOString().slice(0, 10)}`,
      });

      sentToday.set(user.id, (sentToday.get(user.id) ?? 0) + 1);
      sent++;
    }
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

  const { data: orgs } = body.org_id
    ? await db.from("organizations").select("id, name, settings").eq("id", body.org_id)
    : await db.from("organizations").select("id, name, settings");

  let sent = 0;
  for (const org of orgs ?? []) {
    if (org.settings?.project_pulse_enabled === false) continue;
    try {
      sent += await pulseOrg(db, org);
    } catch (_e) {
      // Next tick retries.
    }
  }

  return json({ sent });
});
