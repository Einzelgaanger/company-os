// send-checkin (BUILD_SPEC 8.3)
// Cron-triggered (hourly) or manual. Sends WhatsApp follow-ups for due/stale
// commitments, honouring throttling rules.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendWhatsApp, twilioConfigured } from "../_shared/twilio.ts";
import { templates } from "../_shared/templates.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  // Optional manual mode: { user_id, commitment_id, text }
  let manual: any = null;
  try {
    manual = await req.json();
  } catch {
    manual = null;
  }

  if (manual?.user_id && manual?.text) {
    const { data: user } = await db.from("users").select("*").eq("id", manual.user_id).single();
    if (!user) return json({ error: "user not found" }, 404);
    const channel = twilioConfigured() && user.phone_verified_at ? "whatsapp" : "in_app";
    const sid = channel === "whatsapp" ? await sendWhatsApp(user.phone_number, manual.text) : `INAPP-${crypto.randomUUID().slice(0, 8)}`;
    await db.from("checkins").insert({
      org_id: user.org_id,
      user_id: user.id,
      commitment_id: manual.commitment_id ?? null,
      direction: "outbound",
      channel,
      message_type: manual.commitment_id ? "direct_followup" : "progress_ping",
      message_text: manual.text,
      twilio_sid: sid,
    });
    if (manual.commitment_id) {
      await db.from("commitments").update({ last_checkin_at: new Date().toISOString() }).eq("id", manual.commitment_id);
    }
    await db.from("notifications").insert({
      org_id: user.org_id,
      user_id: user.id,
      kind: "system",
      title: "Loop checked in",
      body: manual.text,
      link: "/inbox",
    });
    return json({ sent: 1, channel });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await db
    .from("commitments")
    .select("*, owner:users!commitments_owner_id_fkey(*), requester:users!commitments_requested_by_id_fkey(full_name)")
    .in("status", ["open", "in_progress", "at_risk", "overdue"])
    .not("owner_id", "is", null);

  const perPersonToday = new Map<string, number>();
  let sent = 0;

  for (const c of due ?? []) {
    const owner = c.owner;
    if (!owner) continue;
    if (owner.notification_prefs?.whatsapp_checkins === false) continue;

    const overdue = c.due_date && c.due_date <= today;
    const stale = !c.last_checkin_at || Date.now() - new Date(c.last_checkin_at).getTime() > 2 * DAY_MS;
    if (!overdue && !stale) continue;

    // Throttle: max 1 per person per commitment / 24h, max 4 per person / day.
    if ((perPersonToday.get(owner.id) ?? 0) >= 4) continue;
    if (c.last_checkin_at && Date.now() - new Date(c.last_checkin_at).getTime() < DAY_MS) continue;

    const body = templates["W-FOLLOWUP"]({
      first_name: owner.full_name.split(" ")[0],
      commitment_title: c.title,
      requester_name: c.requester?.full_name ?? "the requester",
      due_date: c.due_date ?? "soon",
    });

    const channel = twilioConfigured() && owner.phone_verified_at && owner.phone_number ? "whatsapp" : "in_app";

    try {
      const sid =
        channel === "whatsapp"
          ? await sendWhatsApp(owner.phone_number, body)
          : `INAPP-${crypto.randomUUID().slice(0, 8)}`;
      await db.from("checkins").insert({
        org_id: c.org_id,
        user_id: owner.id,
        commitment_id: c.id,
        direction: "outbound",
        channel,
        message_type: "direct_followup",
        message_text: body,
        twilio_sid: sid,
      });
      await db.from("commitments").update({ last_checkin_at: new Date().toISOString() }).eq("id", c.id);
      await db.from("notifications").insert({
        org_id: c.org_id,
        user_id: owner.id,
        kind: "system",
        title: "Loop checked in",
        body: `Status needed on "${c.title}".`,
        link: "/inbox",
      });
      perPersonToday.set(owner.id, (perPersonToday.get(owner.id) ?? 0) + 1);
      sent++;
    } catch (_e) {
      // Leave for next sweep.
    }
  }

  return json({ sent });
});
