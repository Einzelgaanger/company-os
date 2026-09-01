// Shared inbound WhatsApp reply handling (Twilio + Meta Cloud API).
// deno-lint-ignore-file no-explicit-any
import { adminClient } from "./supabase.ts";
import { sendWhatsApp } from "./whatsapp.ts";
import { normalizePhoneE164 } from "./metaWhatsApp.ts";
import { claude, extractJson } from "./anthropic.ts";
import { templates } from "./templates.ts";

const CLARIFY_LIMIT = 1;

export async function processInboundWhatsApp(input: {
  providerMessageId: string;
  fromRaw: string;
  bodyText: string;
}): Promise<{ ok: boolean; deduped?: boolean; error?: string }> {
  const db = adminClient();
  const sid = input.providerMessageId;
  const from = normalizePhoneE164(input.fromRaw.replace(/^whatsapp:/, ""));
  const bodyText = input.bodyText;

  const { data: dup } = await db.from("checkins").select("id").eq("twilio_sid", sid).maybeSingle();
  if (dup) return { ok: true, deduped: true };

  const { data: user } = await db.from("users").select("*").eq("phone_number", from).maybeSingle();
  if (!user) {
    const alt = from.startsWith("+") ? from.slice(1) : `+${from}`;
    const { data: user2 } = await db.from("users").select("*").eq("phone_number", alt).maybeSingle();
    if (!user2) {
      // Unknown number — Meta still delivered; we just can't link to a Loop user.
      return { ok: false, error: "unknown sender" };
    }
    return processInboundForUser(db, user2, sid, from, bodyText);
  }
  return processInboundForUser(db, user, sid, from, bodyText);
}

async function processInboundForUser(
  db: ReturnType<typeof adminClient>,
  user: Record<string, any>,
  sid: string,
  from: string,
  bodyText: string,
): Promise<{ ok: boolean; deduped?: boolean; error?: string }> {
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

  let parsed = { parsed_status: "unclear" as string, parsed_blocker: null as string | null };
  try {
    const out = await claude(
      "You classify short work status replies. Return JSON only.",
      `Classify this reply as one of on_track, blocked, done, unclear, and extract any blocker. ` +
        `Return {"parsed_status": "...", "parsed_blocker": string|null}.\n\nReply: "${bodyText}"`,
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

  // No pending check-in thread — acknowledge so the channel doesn't feel dead.
  if (!commitmentId) {
    const trimmed = bodyText.trim().toLowerCase();
    const greet = trimmed === "help" || trimmed === "hi" || trimmed === "hello" || trimmed === "hey";
    const body = greet
      ? "Hi — I'm Loop. I handle work check-ins here. When Loop pings you about a commitment, reply with your status. For everything else, use the Loop app."
      : "Got it. Loop handles work check-ins — when we ping you about a commitment, reply with on track, blocked, or done. Type HELP for more.";
    const outSid = await sendWhatsApp(user.phone_number ?? from, body);
    await db.from("checkins").insert({
      org_id: user.org_id,
      user_id: user.id,
      commitment_id: null,
      direction: "outbound",
      message_type: "confirmation",
      message_text: body,
      twilio_sid: outSid,
    });
    return { ok: true };
  }

  if (commitmentId) {
    const { data: commitment } = await db.from("commitments").select("*").eq("id", commitmentId).single();

    if (parsed.parsed_status === "done") {
      await db
        .from("commitments")
        .update({ status: "done", resolved_at: new Date().toISOString() })
        .eq("id", commitmentId);
      if (commitment?.requested_by_id) {
        const { data: requester } = await db.from("users").select("*").eq("id", commitment.requested_by_id).single();
        if (requester?.phone_verified_at && requester.phone_number) {
          await sendWhatsApp(
            requester.phone_number,
            templates["W-CONFIRM"]({
              commitment_title: commitment.title,
              resolution_summary: "marked done by the owner",
            }),
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
        body: JSON.stringify({
          commitment_id: commitmentId,
          reason: parsed.parsed_blocker ?? "Owner reported a blocker.",
        }),
      });
    } else if (parsed.parsed_status === "unclear") {
      const { count } = await db
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("commitment_id", commitmentId)
        .eq("message_type", "confirmation");
      if ((count ?? 0) < CLARIFY_LIMIT && commitment) {
        const body = templates["W-CLARIFY"]({ commitment_title: commitment.title });
        const outSid = await sendWhatsApp(user.phone_number ?? from, body);
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
    }
  }

  return { ok: true };
}
