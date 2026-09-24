// escalation-triage — re-ranks every open escalation, hourly.
//
// Turns each person's escalation tab into a queue ordered by how much damage
// waiting will do, rather than by arrival time. Scoring lives in
// _shared/escalationUrgency.ts and is entirely deterministic, so the order is
// reproducible and a manager can be told exactly why something is at the top.
//
// When an item crosses into a higher band the assignee is told, because a
// silent re-rank of a queue nobody is watching changes nothing.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendOutbound } from "../_shared/whatsapp.ts";
import { sendTemplatedEmail, emailTemplates } from "../_shared/emailer.ts";
import { scoreUrgency, type UrgencyBand } from "../_shared/escalationUrgency.ts";

const BAND_RANK: Record<UrgencyBand, number> = { low: 0, medium: 1, high: 2, critical: 3 };

async function triageOrg(db: any, org: any): Promise<{ scored: number; alerted: number }> {
  const { data: escalations } = await db
    .from("escalations")
    .select("*")
    .eq("org_id", org.id)
    .neq("status", "resolved");

  if (!escalations?.length) return { scored: 0, alerted: 0 };

  const commitmentIds = [...new Set(escalations.map((e: any) => e.commitment_id))];

  const { data: commitments } = await db
    .from("commitments")
    .select("id, title, priority, due_date, project_id, sensitivity, owner_id")
    .in("id", commitmentIds);
  const commitmentById = new Map((commitments ?? []).map((c: any) => [c.id, c]));

  const { data: deps } = await db
    .from("commitment_dependencies")
    .select("blocked_by_id")
    .eq("org_id", org.id)
    .in("blocked_by_id", commitmentIds);
  const dependents = new Map<string, number>();
  for (const d of deps ?? []) {
    dependents.set(d.blocked_by_id, (dependents.get(d.blocked_by_id) ?? 0) + 1);
  }

  const projectIds = [
    ...new Set((commitments ?? []).map((c: any) => c.project_id).filter(Boolean)),
  ];
  const { data: projects } = projectIds.length
    ? await db.from("projects").select("id, health").in("id", projectIds)
    : { data: [] };
  const healthById = new Map((projects ?? []).map((p: any) => [p.id, p.health]));

  // How many times this commitment has escalated in total, including closed ones.
  const { data: allForCommitments } = await db
    .from("escalations")
    .select("commitment_id")
    .eq("org_id", org.id)
    .in("commitment_id", commitmentIds);
  const repeats = new Map<string, number>();
  for (const e of allForCommitments ?? []) {
    repeats.set(e.commitment_id, (repeats.get(e.commitment_id) ?? 0) + 1);
  }

  let scored = 0;
  let alerted = 0;

  for (const esc of escalations) {
    const commitment = commitmentById.get(esc.commitment_id);
    const repeatCount = repeats.get(esc.commitment_id) ?? 1;

    const result = scoreUrgency({
      createdAt: esc.created_at,
      dueBy: esc.due_by,
      slaHours: esc.sla_hours ?? 24,
      commitmentPriority: commitment?.priority ?? null,
      commitmentDueDate: commitment?.due_date ?? null,
      repeatCount,
      dependentCount: dependents.get(esc.commitment_id) ?? 0,
      projectHealth: commitment?.project_id ? (healthById.get(commitment.project_id) ?? null) : null,
      sensitivity: commitment?.sensitivity ?? null,
      acknowledged: esc.status === "acknowledged",
    });

    const previousBand = esc.urgency_band as UrgencyBand | null;

    await db
      .from("escalations")
      .update({
        urgency_score: result.score,
        urgency_band: result.band,
        urgency_rationale: result.rationale,
        urgency_computed_at: new Date().toISOString(),
        repeat_count: repeatCount,
        project_id: commitment?.project_id ?? null,
      })
      .eq("id", esc.id);
    scored++;

    // Only escalate the alert when the band actually worsens, so a queue that
    // is merely aging does not generate a message every hour.
    const worsened =
      previousBand && BAND_RANK[result.band] > BAND_RANK[previousBand];
    const newlyCritical = !previousBand && result.band === "critical";

    if ((worsened && BAND_RANK[result.band] >= BAND_RANK.high) || newlyCritical) {
      const { data: assignee } = await db
        .from("users")
        .select("*")
        .eq("id", esc.escalated_to_id)
        .maybeSingle();
      if (!assignee) continue;

      const title = commitment?.title ?? "An escalation";
      const message = `Escalation now ${result.band.toUpperCase()}: *${title}* — ${result.rationale}.`;

      try {
        await sendOutbound(assignee, message);
      } catch {
        // In-app notification below still lands.
      }

      await db.from("notifications").insert({
        org_id: org.id,
        user_id: assignee.id,
        kind: "escalation",
        title: `Escalation moved to ${result.band}`,
        body: `${title} — ${result.rationale}`,
        link: `/escalations/${esc.id}`,
      });

      const { data: owner } = commitment?.owner_id
        ? await db.from("users").select("full_name").eq("id", commitment.owner_id).maybeSingle()
        : { data: null };

      const mail = emailTemplates.escalation_assigned({
        recipient: assignee,
        commitmentTitle: title,
        ownerName: owner?.full_name ?? "the owner",
        requesterName: "the requester",
        dueDate: commitment?.due_date ?? "unscheduled",
        blocker: esc.reason ?? "No detail supplied.",
        urgencyBand: result.band,
        urgencyRationale: result.rationale,
        escalationId: esc.id,
      });
      await sendTemplatedEmail(db, {
        orgId: org.id,
        to: assignee,
        category: "escalation",
        template: "escalation_assigned",
        subject: mail.subject,
        html: mail.html,
        relatedType: "escalation",
        relatedId: esc.id,
        idempotencyKey: `escalation_band:${esc.id}:${result.band}`,
      });

      alerted++;
    }
  }

  return { scored, alerted };
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

  let scored = 0;
  let alerted = 0;
  for (const org of orgs ?? []) {
    try {
      const result = await triageOrg(db, org);
      scored += result.scored;
      alerted += result.alerted;
    } catch (_e) {
      // Next tick retries.
    }
  }

  return json({ scored, alerted });
});
