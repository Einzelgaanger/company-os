// whatsapp-webhook (BUILD_SPEC 8.4)
// Twilio inbound receiver. Validates signature, classifies the reply with
// Claude, updates the linked commitment, and triggers escalation on blockers.
// Idempotent on the Twilio Message SID.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendWhatsApp, validateTwilioSignature } from "../_shared/twilio.ts";
import { claude, extractJson } from "../_shared/anthropic.ts";
import { templates } from "../_shared/templates.ts";

const CLARIFY_LIMIT = 1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = Deno.env.get("PUBLIC_WEBHOOK_URL") ?? req.url;
  if (!validateTwilioSignature(url, params, signature)) {
    return json({ error: "invalid signature" }, 403);
  }

  const db = adminClient();
  const sid = params.MessageSid || params.SmsSid;
  const from = (params.From || "").replace("whatsapp:", "");
  const bodyText = params.Body ?? "";

  // Idempotency on Twilio SID.
  const { data: dup } = await db.from("checkins").select("id").eq("twilio_sid", sid).maybeSingle();
  if (dup) return json({ deduped: true });

  const { data: user } = await db.from("users").select("*").eq("phone_number", from).maybeSingle();
  if (!user) return json({ error: "unknown sender" }, 200);

  // Most recent outbound check-in awaiting a reply (last 72h).
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data: lastOutbound } = await db
    .from("checkins")
    .select("*")
    .eq("user_id", user.id)
    .eq("direction", "outbound")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commitmentId = lastOutbound?.commitment_id ?? null;

  // Classify with Claude (Section 9: no rigid keyword matching).
  let parsed = { parsed_status: "unclear" as string, parsed_blocker: null as string | null };
  try {
    const out = await claude(
      "You classify short work status replies. Return JSON only.",
      `Classify this reply as one of on_track, blocked, done, unclear, and extract any blocker. ` +
        `Return {"parsed_status": "...", "parsed_blocker": string|null}.\n\nReply: "${bodyText}"`
    );
    parsed = extractJson(out);
  } catch {
    parsed = { parsed_status: "unclear", parsed_blocker: null };
  }

  await db.from("checkins").insert({
    org_id: user.org_id,
    user_id: user.id,
    commitment_id: commitmentId,
    direction: "inbound",
    message_type: lastOutbound?.message_type ?? "progress_ping",
    message_text: bodyText,
    parsed_status: parsed.parsed_status,
    parsed_blocker: parsed.parsed_blocker,
    twilio_sid: sid,
  });

  if (commitmentId) {
    const { data: commitment } = await db.from("commitments").select("*").eq("id", commitmentId).single();

    if (parsed.parsed_status === "done") {
      await db
        .from("commitments")
        .update({ status: "done", resolved_at: new Date().toISOString() })
        .eq("id", commitmentId);
      if (commitment?.requested_by_id) {
        const { data: requester } = await db.from("users").select("*").eq("id", commitment.requested_by_id).single();
        if (requester?.phone_verified_at) {
          await sendWhatsApp(
            requester.phone_number,
            templates["W-CONFIRM"]({ commitment_title: commitment.title, resolution_summary: "marked done by the owner" })
          );
        }
      }
    } else if (parsed.parsed_status === "blocked") {
      const base = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${base}/functions/v1/escalate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ commitment_id: commitmentId, reason: parsed.parsed_blocker ?? "Owner reported a blocker." }),
      });
    } else if (parsed.parsed_status === "unclear") {
      // Count prior clarifies to avoid infinite loops.
      const { count } = await db
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("commitment_id", commitmentId)
        .eq("message_type", "confirmation");
      if ((count ?? 0) < CLARIFY_LIMIT && commitment) {
        const body = templates["W-CLARIFY"]({ commitment_title: commitment.title });
        const outSid = await sendWhatsApp(from, body);
        await db.from("checkins").insert({
          org_id: user.org_id,
          user_id: user.id,
          commitment_id: commitmentId,
          direction: "outbound",
          message_type: "confirmation",
          message_text: body,
          twilio_sid: outSid,
        });
      }
      // else: leave for manual review on the commitment page.
    }
  }

  return json({ ok: true });
});
