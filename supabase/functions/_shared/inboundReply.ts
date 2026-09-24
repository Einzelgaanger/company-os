// Shared inbound reply handling (Telegram + WhatsApp + in-app Chat).
// deno-lint-ignore-file no-explicit-any
import { adminClient } from "./supabase.ts";
import { sendOutbound, type MessagingChannel } from "./whatsapp.ts";
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
    if (!user2) return { ok: false, error: "unknown sender" };
    return processInboundForUser(db, user2, sid, bodyText, "whatsapp");
  }
  return processInboundForUser(db, user, sid, bodyText, "whatsapp");
}

export async function processInboundTelegram(input: {
  providerMessageId: string;
  chatId: string;
  username?: string | null;
  bodyText: string;
}): Promise<{ ok: boolean; deduped?: boolean; error?: string; linked?: boolean }> {
  const db = adminClient();
  const sid = input.providerMessageId;
  const bodyText = input.bodyText.trim();

  const { data: dup } = await db.from("checkins").select("id").eq("twilio_sid", sid).maybeSingle();
  if (dup) return { ok: true, deduped: true };

  // Link flow: /start +254...  or  LINK +254...
  const linkMatch = bodyText.match(/^(?:\/start(?:\s+|$)|link\s+)([+\d][\d\s-]{6,})$/i);
  if (linkMatch) {
    const phone = normalizePhoneE164(linkMatch[1].replace(/[\s-]/g, ""));
    let { data: target } = await db.from("users").select("*").eq("phone_number", phone).maybeSingle();
    if (!target) {
      const alt = phone.startsWith("+") ? phone.slice(1) : `+${phone}`;
      ({ data: target } = await db.from("users").select("*").eq("phone_number", alt).maybeSingle());
    }
    if (!target) {
      await sendOutbound(
        { telegram_chat_id: input.chatId },
        "This phone isn’t linked to a Company OS account yet. Ask your admin to add your number first.",
      );
      return { ok: false, error: "unknown phone for link" };
    }
    const prefs = {
      ...(target.notification_prefs ?? { whatsapp_checkins: true }),
      preferred_channel: "telegram",
    };
    await db
      .from("users")
      .update({
        telegram_chat_id: input.chatId,
        telegram_username: input.username ?? null,
        telegram_linked_at: new Date().toISOString(),
        phone_verified_at: target.phone_verified_at ?? new Date().toISOString(),
        notification_prefs: prefs,
      })
      .eq("id", target.id);
    await sendOutbound(
      { ...target, telegram_chat_id: input.chatId, notification_prefs: prefs },
      `Linked — hi ${target.full_name.split(" ")[0]}. When Company OS pings you about a commitment, reply with on track, blocked, or done. You can also use In-app Chat in Company OS.`,
    );
    return { ok: true, linked: true };
  }

  const { data: user } = await db.from("users").select("*").eq("telegram_chat_id", input.chatId).maybeSingle();
  if (!user) {
    await sendOutbound(
      { telegram_chat_id: input.chatId },
      "Hi — I’m Company OS. To link your account, send:\n\nLINK +254700000000\n\n(use your Company OS phone number)",
    );
    return { ok: false, error: "unknown telegram sender" };
  }

  return processInboundForUser(db, user, sid, bodyText, "telegram");
}

/** In-app Chat tab — same classify/escalate path, channel in_app. */
export async function processInboundChat(input: {
  userId: string;
  bodyText: string;
  commitmentId?: string | null;
  providerMessageId?: string;
}): Promise<{ ok: boolean; error?: string; inbound_id?: string }> {
  const db = adminClient();
  const { data: user } = await db.from("users").select("*").eq("id", input.userId).maybeSingle();
  if (!user) return { ok: false, error: "user not found" };
  const sid = input.providerMessageId ?? `INAPP-IN-${crypto.randomUUID().slice(0, 10)}`;
  return processInboundForUser(db, user, sid, input.bodyText.trim(), "in_app", input.commitmentId ?? undefined);
}

/**
 * Read a free-text project pulse reply into structured progress.
 *
 * The three things a manager needs are where the person is, what is in their
 * way, and what they need, and people answer those in one paragraph in any
 * order. Extracting all three at once is what lets project-progress quantify
 * the reply instead of just filing it.
 */
async function processProjectPulseReply(
  db: ReturnType<typeof adminClient>,
  user: Record<string, any>,
  sid: string,
  bodyText: string,
  channel: MessagingChannel,
  projectId: string,
): Promise<{ ok: boolean; error?: string; inbound_id?: string }> {
  const { data: project } = await db
    .from("projects")
    .select("id, name, owner_id")
    .eq("id", projectId)
    .maybeSingle();

  let parsed = {
    status: "unclear" as string,
    self_progress_pct: null as number | null,
    progress_note: null as string | null,
    blocker_text: null as string | null,
    needs_text: null as string | null,
    confidence: 0.4,
  };

  try {
    const out = await claude(
      "You read short project status updates from a team member. Return JSON only.",
      `Extract structured progress from this update about the project "${project?.name ?? "the project"}".

Return {"status": "on_track"|"at_risk"|"blocked"|"done"|"unclear", "self_progress_pct": number|null, "progress_note": string|null, "blocker_text": string|null, "needs_text": string|null, "confidence": number}.

- status: blocked if they cannot proceed, at_risk if they will likely miss a date, done if their part is finished.
- self_progress_pct: only if they state or clearly imply a completion level, else null.
- blocker_text: what is in their way, in their words, condensed. Null if nothing.
- needs_text: what they are asking someone else for. Null if nothing.
- Describe the obstacle, never judge the person.

Update: "${bodyText}"`,
    );
    const extracted = extractJson<typeof parsed>(out);
    parsed = { ...parsed, ...extracted };
  } catch {
    // Keep the reply; project-progress simply sees it as unclear.
  }

  const { data: inboundRow } = await db
    .from("checkins")
    .insert({
      org_id: user.org_id,
      user_id: user.id,
      project_id: projectId,
      commitment_id: null,
      direction: "inbound",
      channel,
      message_type: "project_pulse",
      message_text: bodyText,
      parsed_status:
        parsed.status === "at_risk" ? "unclear" : parsed.status === "done" ? "done" : parsed.status,
      parsed_blocker: parsed.blocker_text,
      twilio_sid: sid,
    })
    .select("id")
    .single();

  // Attach to the oldest unanswered ask so a late reply still lands somewhere.
  const { data: openPulse } = await db
    .from("project_pulses")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .is("responded_at", null)
    .order("asked_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const pulseRow = {
    responded_at: new Date().toISOString(),
    response_checkin_id: inboundRow?.id ?? null,
    status: parsed.status,
    self_progress_pct:
      typeof parsed.self_progress_pct === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.self_progress_pct)))
        : null,
    progress_note: parsed.progress_note,
    blocker_text: parsed.blocker_text,
    needs_text: parsed.needs_text,
    confidence: parsed.confidence,
  };

  if (openPulse) {
    await db.from("project_pulses").update(pulseRow).eq("id", openPulse.id);
  } else {
    // Unprompted update — still worth recording against the project.
    await db.from("project_pulses").insert({
      org_id: user.org_id,
      project_id: projectId,
      user_id: user.id,
      asked_at: new Date().toISOString(),
      ...pulseRow,
    });
  }

  // A blocker nobody is told about is the thing this product exists to prevent.
  if (parsed.status === "blocked" && project?.owner_id && project.owner_id !== user.id) {
    await db.from("notifications").insert({
      org_id: user.org_id,
      user_id: project.owner_id,
      kind: "escalation",
      title: `${user.full_name} is blocked on ${project.name}`,
      body: parsed.blocker_text ?? bodyText.slice(0, 200),
      link: `/projects/${projectId}`,
    });
  }

  const ack =
    parsed.status === "blocked"
      ? `Thanks — logged that you're blocked on ${project?.name ?? "the project"}. I've flagged it to the project lead.`
      : `Thanks — that's on the ${project?.name ?? "project"} board now.`;
  const { sid: outSid, channel: outChannel } = await sendOutbound(user, ack);
  await db.from("checkins").insert({
    org_id: user.org_id,
    user_id: user.id,
    project_id: projectId,
    direction: "outbound",
    channel: outChannel,
    message_type: "confirmation",
    message_text: ack,
    twilio_sid: outSid,
  });

  return { ok: true, inbound_id: inboundRow?.id };
}

export async function processInboundForUser(
  db: ReturnType<typeof adminClient>,
  user: Record<string, any>,
  sid: string,
  bodyText: string,
  channel: MessagingChannel = "in_app",
  forcedCommitmentId?: string | null,
): Promise<{ ok: boolean; deduped?: boolean; error?: string; inbound_id?: string }> {
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

  // A project pulse asks three open questions about a whole project, so it must
  // be read before the commitment classifier claims the reply and reduces it to
  // on_track / blocked / done against a single item.
  if (
    lastOutbound?.message_type === "project_pulse" &&
    lastOutbound.project_id &&
    (forcedCommitmentId === undefined || forcedCommitmentId === null)
  ) {
    return processProjectPulseReply(db, user, sid, bodyText, channel, lastOutbound.project_id);
  }

  const commitmentId =
    forcedCommitmentId !== undefined && forcedCommitmentId !== null
      ? forcedCommitmentId
      : (lastOutbound?.commitment_id ?? null);

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

  const { data: inboundRow } = await db
    .from("checkins")
    .insert({
      org_id: user.org_id,
      user_id: user.id,
      commitment_id: commitmentId,
      direction: "inbound",
      channel,
      message_type: lastOutbound?.message_type ?? "progress_ping",
      message_text: bodyText,
      parsed_status: parsed.parsed_status,
      parsed_blocker: parsed.parsed_blocker,
      twilio_sid: sid,
    })
    .select("id")
    .single();

  if (!commitmentId) {
    const trimmed = bodyText.trim().toLowerCase();
    const greet =
      trimmed === "help" ||
      trimmed === "hi" ||
      trimmed === "hello" ||
      trimmed === "hey" ||
      trimmed === "/help" ||
      trimmed === "/start";
    const body = greet
      ? "Hi — I'm Company OS. I handle work check-ins here. When we ping you about a commitment, reply with your status. You can also use In-app Chat in the app."
      : "Got it. Company OS handles work check-ins — when we ping you about a commitment, reply with on track, blocked, or done. Type HELP for more.";
    const { sid: outSid, channel: outChannel } = await sendOutbound(user, body);
    await db.from("checkins").insert({
      org_id: user.org_id,
      user_id: user.id,
      commitment_id: null,
      direction: "outbound",
      channel: outChannel,
      message_type: "confirmation",
      message_text: body,
      twilio_sid: outSid,
    });
    return { ok: true, inbound_id: inboundRow?.id };
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
        if (requester) {
          const confirm = templates["W-CONFIRM"]({
            commitment_title: commitment.title,
            resolution_summary: "marked done by the owner",
          });
          const { sid: outSid, channel: outChannel } = await sendOutbound(requester, confirm);
          await db.from("checkins").insert({
            org_id: requester.org_id,
            user_id: requester.id,
            commitment_id: commitmentId,
            direction: "outbound",
            channel: outChannel,
            message_type: "confirmation",
            message_text: confirm,
            twilio_sid: outSid,
          });
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
        const { sid: outSid, channel: outChannel } = await sendOutbound(user, body);
        await db.from("checkins").insert({
          org_id: user.org_id,
          user_id: user.id,
          commitment_id: commitmentId,
          direction: "outbound",
          channel: outChannel,
          message_type: "confirmation",
          message_text: body,
          twilio_sid: outSid,
        });
      }
    } else if (parsed.parsed_status === "on_track" && commitment) {
      await db
        .from("commitments")
        .update({ status: "in_progress", last_checkin_at: new Date().toISOString() })
        .eq("id", commitmentId);
      const body = `Thanks — marked "${commitment.title}" as on track.`;
      const { sid: outSid, channel: outChannel } = await sendOutbound(user, body);
      await db.from("checkins").insert({
        org_id: user.org_id,
        user_id: user.id,
        commitment_id: commitmentId,
        direction: "outbound",
        channel: outChannel,
        message_type: "confirmation",
        message_text: body,
        twilio_sid: outSid,
      });
    }
  }

  return { ok: true, inbound_id: inboundRow?.id };
}
