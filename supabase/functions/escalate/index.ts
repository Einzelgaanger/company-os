// escalate (BUILD_SPEC 8.5)
// Called by whatsapp-webhook on a blocker, or by the scheduled sweep. Routes
// via the ownership map, falling back to the requester's manager, then any
// admin/owner. Builds a frozen context snapshot and notifies via WhatsApp/in-app.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders, audit } from "../_shared/supabase.ts";
import { sendWhatsApp, whatsappConfigured } from "../_shared/whatsapp.ts";
import { templates } from "../_shared/templates.ts";

const SENS_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
const clearanceRank = (role: string) => (role === "owner" || role === "admin" ? 3 : role === "manager" ? 2 : 1);
const redacted = (s: string) => `[Redacted — ${s} data; requires higher clearance]`;

function governContext(commitment: any, checkins: any[], recipientRole: string, reason: string, sla: number) {
  const sensitivity = commitment.sensitivity ?? "internal";
  const cleared = SENS_RANK[sensitivity] <= clearanceRank(recipientRole);
  if (cleared) return { commitment, checkins, reason, sla_hours_elapsed: sla };
  return {
    commitment: { ...commitment, description: commitment.description ? redacted(sensitivity) : null },
    checkins: checkins.map((c) => ({
      ...c,
      message_text: redacted(sensitivity),
      parsed_blocker: c.parsed_blocker ? redacted(sensitivity) : null,
    })),
    reason: `${reason} (details restricted by data governance)`,
    sla_hours_elapsed: sla,
  };
}

async function routeTarget(db: any, commitment: any): Promise<{ id: string; sla: number } | null> {
  const { data: maps } = await db.from("ownership_map").select("*").eq("org_id", commitment.org_id);
  const haystack = `${commitment.title} ${commitment.description ?? ""}`.toLowerCase();
  const tagHaystack = Array.isArray(commitment.tag_ids) ? commitment.tag_ids.join(" ") : "";
  for (const m of maps ?? []) {
    const cat = String(m.category).toLowerCase();
    if (haystack.includes(cat) || tagHaystack.includes(cat) || cat === "default") {
      const { data: pending } = await db
        .from("escalations")
        .select("id")
        .eq("escalated_to_id", m.primary_owner_id)
        .eq("status", "open")
        .limit(1);
      const target = pending?.length && m.backup_owner_id ? m.backup_owner_id : m.primary_owner_id;
      return { id: target, sla: m.sla_hours };
    }
  }
  if (commitment.requested_by_id) {
    const { data: requester } = await db.from("users").select("manager_id").eq("id", commitment.requested_by_id).single();
    if (requester?.manager_id) return { id: requester.manager_id, sla: 24 };
  }
  const { data: admin } = await db
    .from("users")
    .select("id")
    .eq("org_id", commitment.org_id)
    .in("role", ["admin", "owner"])
    .limit(1)
    .maybeSingle();
  return admin ? { id: admin.id, sla: 24 } : null;
}

async function escalateOne(db: any, commitment_id: string, reason: string): Promise<string | null> {
  const { data: commitment } = await db.from("commitments").select("*").eq("id", commitment_id).single();
  if (!commitment) return null;

  const { data: open } = await db
    .from("escalations")
    .select("id")
    .eq("commitment_id", commitment_id)
    .eq("status", "open")
    .limit(1);
  if (open?.length) return open[0].id;

  const target = await routeTarget(db, commitment);
  if (!target) return null;

  const { data: target_user } = await db.from("users").select("*").eq("id", target.id).single();

  const { data: lastCheckins } = await db
    .from("checkins")
    .select("*")
    .eq("commitment_id", commitment_id)
    .order("created_at", { ascending: false })
    .limit(3);

  const snapshot = governContext(
    commitment,
    (lastCheckins ?? []).reverse(),
    target_user?.role ?? "member",
    reason,
    target.sla
  );

  const { data: escalation } = await db
    .from("escalations")
    .insert({
      org_id: commitment.org_id,
      commitment_id,
      escalated_to_id: target.id,
      reason,
      context_snapshot: snapshot,
      status: "open",
    })
    .select("id")
    .single();

  await db.from("commitments").update({ status: "escalated" }).eq("id", commitment_id);

  const { data: owner } = commitment.owner_id
    ? await db.from("users").select("full_name").eq("id", commitment.owner_id).single()
    : { data: null };
  const { data: requester } = commitment.requested_by_id
    ? await db.from("users").select("full_name").eq("id", commitment.requested_by_id).single()
    : { data: null };

  if (whatsappConfigured() && target_user?.phone_verified_at && target_user.phone_number) {
    await sendWhatsApp(
      target_user.phone_number,
      templates["W-ESCALATE"]({
        escalated_to_name: target_user.full_name.split(" ")[0],
        commitment_title: commitment.title,
        requester_name: requester?.full_name ?? "the requester",
        due_date: commitment.due_date ?? "soon",
        owner_name: owner?.full_name ?? commitment.owner_external_name ?? "the owner",
        blocker_text: reason,
      })
    );
  }

  await db.from("notifications").insert({
    org_id: commitment.org_id,
    user_id: target.id,
    kind: "escalation",
    title: "Escalation assigned to you",
    body: `${commitment.title} needs your help to unblock.`,
    link: `/escalations/${escalation.id}`,
  });

  await audit(db, commitment.org_id, "system", "escalation.created", "escalation", escalation.id, {
    commitment_id,
    escalated_to: target.id,
  });

  return escalation.id as string;
}

async function escalateSweep(db: any): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: candidates } = await db
    .from("commitments")
    .select("id, status, due_date, last_checkin_at")
    .in("status", ["open", "in_progress", "at_risk", "overdue"])
    .not("owner_id", "is", null);

  const ids: string[] = [];
  for (const c of candidates ?? []) {
    const overdue = c.due_date && c.due_date <= today;
    let stalled = false;
    if (c.last_checkin_at) {
      const { data: last } = await db
        .from("checkins")
        .select("direction, message_type, created_at")
        .eq("commitment_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        last?.direction === "outbound" &&
        last.message_type === "direct_followup" &&
        Date.now() - new Date(last.created_at).getTime() > 24 * 60 * 60 * 1000
      ) {
        stalled = true;
      }
    }
    if (!overdue && !stalled && c.status !== "overdue") continue;
    const reason = overdue ? "Past due with no confirmation." : "No response after a direct follow-up.";
    const id = await escalateOne(db, c.id, reason);
    if (id) ids.push(id);
  }
  return ids;
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

  const reason = body.reason ?? "Commitment stalled past SLA.";

  // Cron / manual sweep when no specific commitment is named.
  if (!body.commitment_id) {
    const ids = await escalateSweep(db);
    return json({ swept: ids.length, escalation_ids: ids });
  }

  const escalation_id = await escalateOne(db, body.commitment_id, reason);
  if (!escalation_id) return json({ error: "could not escalate" }, 422);
  return json({ escalation_id });
});
