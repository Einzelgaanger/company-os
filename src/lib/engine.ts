// Loop autonomous engine (client-side).
//
// This mirrors the logic of the Supabase Edge Functions (send-checkin,
// whatsapp-webhook, escalate) so the running app demonstrably "runs itself":
// it checks in on owners, nudges when they go quiet, escalates what stalls,
// and shares context that respects data-governance clearance.

import { store } from "./store";
import { nowIso, uuid } from "./utils";
import { clearanceFor, SENSITIVITY_LABEL, SENSITIVITY_RANK } from "./types";
import {
  buildDigestBuckets,
  DEFAULT_OUTBOUND_MAX_AGE_HOURS,
  formatDigestMessage,
  isSnoozed,
  isWithinRecencyWindow,
  parseSnoozeDate,
} from "./quality";
import type {
  Checkin,
  Commitment,
  Escalation,
  EscalationContextSnapshot,
  Organization,
  OwnershipMapEntry,
  ParsedStatus,
  Sensitivity,
  User,
} from "./types";

export interface EngineConfig {
  checkinStaleHours: number;
  nudgeAfterHours: number;
  escalationSlaHours: number;
  outboundMaxAgeHours: number;
  dailyDigestEnabled: boolean;
  dailyDigestHour: number;
}

export interface EngineRunSummary {
  ranAt: string;
  checkins: number;
  nudges: number;
  escalations: number;
  digests: number;
  notes: string[];
}

function configFor(org: Organization): EngineConfig {
  return {
    checkinStaleHours: org.settings.checkin_stale_hours ?? 48,
    nudgeAfterHours: org.settings.nudge_after_hours ?? 24,
    escalationSlaHours: org.settings.escalation_sla_hours ?? 24,
    outboundMaxAgeHours: org.settings.outbound_max_age_hours ?? DEFAULT_OUTBOUND_MAX_AGE_HOURS,
    dailyDigestEnabled: org.settings.daily_digest_enabled !== false,
    dailyDigestHour: org.settings.daily_digest_hour ?? 8,
  };
}

function hoursSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function firstName(name: string): string {
  return name.split(" ")[0];
}

// --- store write helpers (engine acts as "system") -----------------------

function pushCheckin(c: Checkin) {
  store.set("checkins", [...store.all("checkins"), c]);
}

function pushAudit(orgId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  store.set("audit_log", [
    ...store.all("audit_log"),
    {
      id: uuid(),
      org_id: orgId,
      actor: "system",
      action,
      target_type: "commitment",
      target_id: targetId,
      metadata,
      created_at: nowIso(),
    },
  ]);
}

function pushNotification(orgId: string, userId: string, kind: "escalation" | "system", title: string, body: string, link: string) {
  store.set("notifications", [
    ...store.all("notifications"),
    { id: uuid(), org_id: orgId, user_id: userId, kind, title, body, link, read_at: null, created_at: nowIso() },
  ]);
}

function patchCommitment(id: string, patch: Partial<Commitment>) {
  store.set(
    "commitments",
    store.all("commitments").map((c) => (c.id === id ? { ...c, ...patch, updated_at: nowIso() } : c))
  );
}

// --- message copy --------------------------------------------------------

function progressPing(owner: User, c: Commitment): string {
  return `Hi ${firstName(owner.full_name)} — quick check on "${c.title}". How's it tracking? Reply: on track / blocked / done.`;
}

function nudgeMessage(c: Commitment): string {
  return `Following up on "${c.title}" — I haven't heard back. A one-word status is perfect: on track, blocked, or done?`;
}

// --- sweeps --------------------------------------------------------------

function activeCommitments(orgId: string): Commitment[] {
  return store
    .all("commitments")
    .filter((c) => c.org_id === orgId && c.status !== "done" && !c.needs_review && !isSnoozed(c));
}

function meetingOccurredAt(commitment: Commitment): string | null {
  if (!commitment.source_meeting_id) return null;
  return store.all("meetings").find((m) => m.id === commitment.source_meeting_id)?.occurred_at ?? null;
}

function latestCheckin(commitmentId: string): Checkin | undefined {
  return store
    .all("checkins")
    .filter((c) => c.commitment_id === commitmentId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
}

/** Send a first-touch progress check-in on commitments that have gone quiet. */
export function checkinSweep(org: Organization, users: User[], cfg = configFor(org)): number {
  let count = 0;
  for (const c of activeCommitments(org.id)) {
    if (!c.owner_id) continue; // external owners are handled via escalation routing
    const owner = users.find((u) => u.id === c.owner_id);
    if (!owner || !owner.notification_prefs.whatsapp_checkins) continue;
    // Recency guard — never blast check-ins for stale historical meetings (DANI lesson).
    if (!isWithinRecencyWindow(meetingOccurredAt(c), cfg.outboundMaxAgeHours)) continue;

    const last = latestCheckin(c.id);
    // Skip if we already have an unanswered outbound message pending.
    if (last && last.direction === "outbound") continue;
    if (hoursSince(c.last_checkin_at) < cfg.checkinStaleHours) continue;

    pushCheckin({
      id: uuid(),
      org_id: org.id,
      user_id: owner.id,
      commitment_id: c.id,
      direction: "outbound",
      channel: owner.phone_verified_at ? "whatsapp" : "in_app",
      message_type: "progress_ping",
      message_text: progressPing(owner, c),
      parsed_status: null,
      parsed_blocker: null,
      twilio_sid: owner.phone_verified_at ? `SM-auto-${uuid().slice(0, 8)}` : null,
      created_at: nowIso(),
    });
    patchCommitment(c.id, { last_checkin_at: nowIso() });
    pushNotification(org.id, owner.id, "system", "Loop checked in", `Quick status needed on "${c.title}".`, "/my-work");
    pushAudit(org.id, "engine.checkin", c.id, { auto: true });
    count++;
  }
  return count;
}

/** Nudge owners who received a check-in but haven't replied. */
export function nudgeSweep(org: Organization, users: User[], cfg = configFor(org)): number {
  let count = 0;
  for (const c of activeCommitments(org.id)) {
    if (!c.owner_id || c.status === "escalated") continue;
    const owner = users.find((u) => u.id === c.owner_id);
    if (!owner) continue;
    const last = latestCheckin(c.id);
    if (!last || last.direction !== "outbound") continue;
    if (last.message_type === "direct_followup") continue; // already nudged; escalation is next
    if (hoursSince(last.created_at) < cfg.nudgeAfterHours) continue;

    pushCheckin({
      id: uuid(),
      org_id: org.id,
      user_id: owner.id,
      commitment_id: c.id,
      direction: "outbound",
      channel: owner.phone_verified_at ? "whatsapp" : "in_app",
      message_type: "direct_followup",
      message_text: nudgeMessage(c),
      parsed_status: null,
      parsed_blocker: null,
      twilio_sid: owner.phone_verified_at ? `SM-auto-${uuid().slice(0, 8)}` : null,
      created_at: nowIso(),
    });
    pushNotification(org.id, owner.id, "system", "Reminder from Loop", `Still need a status on "${c.title}".`, "/my-work");
    pushAudit(org.id, "engine.nudge", c.id, { auto: true });
    count++;
  }
  return count;
}

// --- governance-aware context sharing ------------------------------------

const REDACTED = (s: Sensitivity) => `[Redacted — ${SENSITIVITY_LABEL[s]} data; requires higher clearance]`;

/**
 * Build a context snapshot for an escalation, redacting fields the recipient
 * is not cleared to see. This is the "share context, but govern it" guarantee.
 */
export function buildGovernedContext(
  commitment: Commitment,
  checkins: Checkin[],
  recipient: User,
  reason: string,
  slaHoursElapsed: number
): EscalationContextSnapshot {
  const sensitivity = commitment.sensitivity ?? "internal";
  const cleared = SENSITIVITY_RANK[sensitivity] <= SENSITIVITY_RANK[clearanceFor(recipient.role)];
  const scrub = <T extends { message_text: string; parsed_blocker: string | null }>(rows: T[]): T[] =>
    cleared ? rows : rows.map((r) => ({ ...r, message_text: REDACTED(sensitivity), parsed_blocker: r.parsed_blocker ? REDACTED(sensitivity) : null }));

  const safeCommitment = cleared
    ? commitment
    : { ...commitment, description: commitment.description ? REDACTED(sensitivity) : null };

  return {
    commitment: safeCommitment,
    checkins: scrub(checkins),
    reason: cleared ? reason : `${reason} (details restricted by data governance)`,
    sla_hours_elapsed: Math.round(slaHoursElapsed),
  };
}

function routeOwner(commitment: Commitment, map: OwnershipMapEntry[], users: User[]): User | undefined {
  // Prefer an ownership-map category that matches a tag name on the commitment.
  const tagNames = new Set(
    (commitment.tag_ids ?? [])
      .map((id) => store.all("tags").find((t) => t.id === id)?.name)
      .filter(Boolean) as string[]
  );
  const entry =
    map.find((m) => tagNames.has(m.category.toLowerCase())) ??
    map.find((m) => m.category.toLowerCase() === "default") ??
    map[0];
  const targetId = entry?.primary_owner_id;
  return users.find((u) => u.id === targetId) ?? users.find((u) => u.role === "owner" || u.role === "admin");
}

/** Escalate commitments that are overdue or stalled after a nudge. */
export function escalateSweep(org: Organization, users: User[], cfg = configFor(org)): number {
  const openEscalations = store.all("escalations").filter((e) => e.org_id === org.id && e.status === "open");
  const alreadyEscalated = new Set(openEscalations.map((e) => e.commitment_id));
  const map = store.all("ownership_map").filter((m) => m.org_id === org.id);
  let count = 0;

  for (const c of activeCommitments(org.id)) {
    if (alreadyEscalated.has(c.id)) continue;
    const last = latestCheckin(c.id);
    const stalled =
      last &&
      last.direction === "outbound" &&
      last.message_type === "direct_followup" &&
      hoursSince(last.created_at) >= cfg.escalationSlaHours;
    const overdue = c.status === "overdue" || (c.due_date != null && hoursSince(c.due_date) > 0 && c.status !== "done");
    if (!stalled && !overdue) continue;

    const recipient = routeOwner(c, map, users);
    if (!recipient) continue;

    const checkins = store.all("checkins").filter((k) => k.commitment_id === c.id);
    const reason = overdue ? "Past due with no confirmation." : "No response after a direct follow-up.";
    const snapshot = buildGovernedContext(c, checkins, recipient, reason, hoursSince(last?.created_at ?? c.last_checkin_at));

    const esc: Escalation = {
      id: uuid(),
      org_id: org.id,
      commitment_id: c.id,
      escalated_to_id: recipient.id,
      reason,
      context_snapshot: snapshot,
      status: "open",
      created_at: nowIso(),
      acknowledged_at: null,
      resolved_at: null,
    };
    store.set("escalations", [...store.all("escalations"), esc]);
    patchCommitment(c.id, { status: "escalated" });
    pushNotification(org.id, recipient.id, "escalation", "Escalation", `"${c.title}" needs your attention. ${reason}`, `/escalations/${esc.id}`);
    pushAudit(org.id, "engine.escalate", c.id, { to: recipient.id, sensitivity: c.sensitivity ?? "internal" });
    count++;
  }
  return count;
}

/** Personal morning digest — overdue / due today / upcoming / no due. */
export function digestSweep(org: Organization, users: User[], cfg = configFor(org)): number {
  if (!cfg.dailyDigestEnabled) return 0;
  const hour = new Date().getHours();
  // Fire in a ±1h window around configured hour so a 60s tick can catch it.
  if (Math.abs(hour - cfg.dailyDigestHour) > 1) return 0;

  const todayKey = new Date().toISOString().slice(0, 10);
  let count = 0;
  const all = store.all("commitments").filter((c) => c.org_id === org.id);

  for (const owner of users) {
    if (owner.status !== "active") continue;
    if (owner.notification_prefs.daily_digest === false) continue;
    // Idempotent: one digest per user per day.
    const already = store
      .all("checkins")
      .some(
        (k) =>
          k.user_id === owner.id &&
          k.message_type === "daily_pulse" &&
          k.created_at.slice(0, 10) === todayKey
      );
    if (already) continue;

    const mine = all.filter((c) => c.owner_id === owner.id);
    const buckets = buildDigestBuckets(mine);
    const text = formatDigestMessage(owner.full_name, buckets);
    if (!text) continue;

    pushCheckin({
      id: uuid(),
      org_id: org.id,
      user_id: owner.id,
      commitment_id: null,
      direction: "outbound",
      channel: owner.phone_verified_at ? "whatsapp" : "in_app",
      message_type: "daily_pulse",
      message_text: text,
      parsed_status: null,
      parsed_blocker: null,
      twilio_sid: owner.phone_verified_at ? `SM-digest-${uuid().slice(0, 8)}` : null,
      created_at: nowIso(),
    });
    pushNotification(org.id, owner.id, "system", "Morning digest", text.slice(0, 180), "/commitments");
    pushAudit(org.id, "engine.digest", owner.id, { auto: true });
    count++;
  }
  return count;
}

export function runEngineOnce(org: Organization, users: User[]): EngineRunSummary {
  const cfg = configFor(org);
  const checkins = checkinSweep(org, users, cfg);
  const nudges = nudgeSweep(org, users, cfg);
  const escalations = escalateSweep(org, users, cfg);
  const digests = digestSweep(org, users, cfg);
  const notes: string[] = [];
  if (checkins) notes.push(`Checked in on ${checkins} commitment${checkins > 1 ? "s" : ""}`);
  if (nudges) notes.push(`Nudged ${nudges} owner${nudges > 1 ? "s" : ""}`);
  if (escalations) notes.push(`Escalated ${escalations} stalled item${escalations > 1 ? "s" : ""}`);
  if (digests) notes.push(`Sent ${digests} morning digest${digests > 1 ? "s" : ""}`);
  if (notes.length === 0) notes.push("Everything on track — nothing needed action.");
  return { ranAt: nowIso(), checkins, nudges, escalations, digests, notes };
}

// --- inbound handling (owner replies from the check-in inbox) -------------

export function classifyResponse(text: string): {
  status: ParsedStatus;
  blocker: string | null;
  snoozeUntil: string | null;
} {
  const t = text.toLowerCase();
  if (/\b(done|completed|finished|shipped|sent|delivered)\b/.test(t))
    return { status: "done", blocker: null, snoozeUntil: null };
  if (/\b(snooze|defer|push)\b/.test(t) || /\bnext week\b/.test(t)) {
    return { status: "snoozed", blocker: null, snoozeUntil: parseSnoozeDate(text) };
  }
  if (/\b(blocked|stuck|waiting|can'?t|cannot|issue|problem|delay)\b/.test(t))
    return { status: "blocked", blocker: text.trim(), snoozeUntil: null };
  if (/\b(on track|track|good|fine|progress|almost|nearly|yes)\b/.test(t))
    return { status: "on_track", blocker: null, snoozeUntil: null };
  return { status: "unclear", blocker: null, snoozeUntil: null };
}

/** Record an owner's reply to a check-in and advance the commitment state. */
export async function recordInboundResponse(
  org: Organization,
  owner: User,
  commitment: Commitment,
  text: string
): Promise<ParsedStatus> {
  const { status, blocker, snoozeUntil } = classifyResponse(text);
  const { db } = await import("./db");
  const { isMockMode } = await import("./supabase");

  if (isMockMode) {
    pushCheckin({
      id: uuid(),
      org_id: org.id,
      user_id: owner.id,
      commitment_id: commitment.id,
      direction: "inbound",
      channel: owner.phone_verified_at ? "whatsapp" : "in_app",
      message_type: "confirmation",
      message_text: text.trim(),
      parsed_status: status,
      parsed_blocker: blocker,
      twilio_sid: null,
      created_at: nowIso(),
    });
    if (status === "done") {
      patchCommitment(commitment.id, { status: "done", resolved_at: nowIso(), last_checkin_at: nowIso() });
    } else if (status === "snoozed") {
      patchCommitment(commitment.id, {
        snoozed_until: snoozeUntil,
        last_checkin_at: nowIso(),
      });
    } else if (status === "blocked") {
      patchCommitment(commitment.id, { status: "at_risk", last_checkin_at: nowIso() });
    } else if (status === "on_track") {
      patchCommitment(commitment.id, { status: "in_progress", last_checkin_at: nowIso(), snoozed_until: null });
    } else {
      patchCommitment(commitment.id, { last_checkin_at: nowIso() });
    }
    pushAudit(org.id, "engine.inbound", commitment.id, { status, snoozeUntil });
    return status;
  }

  await db.createInboundCheckin({
    org_id: org.id,
    user_id: owner.id,
    commitment_id: commitment.id,
    direction: "inbound",
    channel: owner.phone_verified_at ? "whatsapp" : "in_app",
    message_type: "confirmation",
    message_text: text.trim(),
    parsed_status: status,
    parsed_blocker: blocker,
  });

  if (status === "done") {
    await db.updateCommitment(commitment.id, {
      status: "done",
      resolved_at: nowIso(),
      last_checkin_at: nowIso(),
    });
  } else if (status === "snoozed") {
    await db.updateCommitment(commitment.id, {
      snoozed_until: snoozeUntil,
      last_checkin_at: nowIso(),
    });
  } else if (status === "blocked") {
    await db.updateCommitment(commitment.id, { status: "at_risk", last_checkin_at: nowIso() });
  } else if (status === "on_track") {
    await db.updateCommitment(commitment.id, {
      status: "in_progress",
      last_checkin_at: nowIso(),
      snoozed_until: null,
    });
  } else {
    await db.updateCommitment(commitment.id, { last_checkin_at: nowIso() });
  }

  return status;
}
