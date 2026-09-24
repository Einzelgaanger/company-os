// project-progress — turns commitments and attributed pulse feedback into the
// numbers the project page shows: percent delivered, who is on what right now,
// the main blocker, and a forecast completion date.
//
// Percent complete is priority-weighted commitment delivery, never elapsed
// time, so a project does not drift to "80% done" just because the calendar
// moved. Self-reported pulse progress deliberately does NOT inflate that
// figure — it feeds health and the forecast instead. Otherwise the headline
// number becomes a measure of optimism.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { claude, extractJson } from "../_shared/anthropic.ts";

const DAY_MS = 86_400_000;
const POINTS: Record<string, number> = { critical: 5, high: 3, medium: 2, low: 1 };
const ACTIVE_STATUSES = ["in_progress", "at_risk", "escalated"];

const pointsFor = (priority?: string | null) => POINTS[(priority ?? "medium").toLowerCase()] ?? 2;
const round2 = (n: number) => Math.round(n * 100) / 100;

type Cluster = { label: string; count: number; examples: string[] };

/** Group free-text blockers into themes. Falls back to raw frequency counting. */
async function clusterText(texts: string[], kind: "blocker" | "need"): Promise<Cluster[]> {
  const clean = texts.map((t) => t.trim()).filter((t) => t.length > 3);
  if (!clean.length) return [];

  if (clean.length >= 3) {
    try {
      const out = await claude(
        "You group short work status notes into themes. Return JSON only.",
        `Group these ${kind === "blocker" ? "blockers" : "requests for help"} into at most 4 themes, most common first.
Return {"clusters": [{"label": string, "count": number}]}. Labels are short noun phrases describing the obstacle, not a person.

${clean.map((t) => `- ${t}`).join("\n")}`,
        600,
      );
      const parsed = extractJson<{ clusters?: Array<{ label: string; count: number }> }>(out);
      const clusters = (parsed?.clusters ?? []).filter((c) => c?.label);
      if (clusters.length) {
        return clusters.slice(0, 4).map((c) => ({
          label: String(c.label).slice(0, 120),
          count: Number(c.count) || 1,
          examples: [],
        }));
      }
    } catch {
      // Fall through to frequency counting.
    }
  }

  const counts = new Map<string, number>();
  for (const t of clean) {
    const key = t.toLowerCase().slice(0, 80);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count, examples: [] }));
}

async function snapshotProject(db: any, org: any, project: any, asOf: string): Promise<void> {
  const today = asOf;
  const since28 = new Date(Date.now() - 28 * DAY_MS).toISOString();
  const since14 = new Date(Date.now() - 14 * DAY_MS).toISOString();

  const { data: commitments } = await db
    .from("commitments")
    .select("id, title, status, priority, owner_id, due_date, updated_at, resolved_at")
    .eq("project_id", project.id);

  const rows = commitments ?? [];

  const { data: members } = await db
    .from("project_members")
    .select("user_id, role_in_project, users!inner(id, full_name)")
    .eq("project_id", project.id);

  const { data: pulses } = await db
    .from("project_pulses")
    .select("user_id, status, self_progress_pct, blocker_text, needs_text, responded_at, asked_at")
    .eq("project_id", project.id)
    .gte("asked_at", since14)
    .order("asked_at", { ascending: false });

  const { data: escalations } = await db
    .from("escalations")
    .select("id, reason, status, commitment_id")
    .eq("org_id", org.id)
    .neq("status", "resolved")
    .in("commitment_id", rows.length ? rows.map((c: any) => c.id) : ["00000000-0000-0000-0000-000000000000"]);

  // --- Delivery -------------------------------------------------------------
  let totalPoints = 0;
  let donePoints = 0;
  for (const c of rows) {
    const p = pointsFor(c.priority);
    totalPoints += p;
    if (c.status === "done") donePoints += p;
  }
  const progressPct = totalPoints ? round2((donePoints / totalPoints) * 100) : 0;

  const open = rows.filter((c: any) => c.status !== "done");
  const overdue = open.filter((c: any) => c.due_date && c.due_date < today);
  const active = rows.filter((c: any) => ACTIVE_STATUSES.includes(c.status));

  // --- Attributed feedback --------------------------------------------------
  const latestPulseByUser = new Map<string, any>();
  for (const p of pulses ?? []) {
    if (!latestPulseByUser.has(p.user_id)) latestPulseByUser.set(p.user_id, p);
  }
  const answered = (pulses ?? []).filter((p: any) => p.responded_at);

  const memberBreakdown = (members ?? []).map((m: any) => {
    const user = m.users;
    const mine = rows.filter((c: any) => c.owner_id === user.id);
    const minePoints = mine.reduce((sum: number, c: any) => sum + pointsFor(c.priority), 0);
    const mineDone = mine
      .filter((c: any) => c.status === "done")
      .reduce((sum: number, c: any) => sum + pointsFor(c.priority), 0);
    const pulse = latestPulseByUser.get(user.id);
    return {
      user_id: user.id,
      name: user.full_name,
      role_in_project: m.role_in_project,
      total_points: round2(minePoints),
      done_points: round2(mineDone),
      pct: minePoints ? round2((mineDone / minePoints) * 100) : null,
      open_count: mine.filter((c: any) => c.status !== "done").length,
      overdue_count: mine.filter((c: any) => c.status !== "done" && c.due_date && c.due_date < today).length,
      active_titles: mine
        .filter((c: any) => ACTIVE_STATUSES.includes(c.status))
        .map((c: any) => c.title)
        .slice(0, 3),
      status: pulse?.status ?? null,
      self_progress_pct: pulse?.self_progress_pct ?? null,
      blocker: pulse?.blocker_text ?? null,
      needs: pulse?.needs_text ?? null,
      last_heard_at: pulse?.responded_at ?? null,
    };
  });

  const ownerName = new Map(
    (members ?? []).map((m: any) => [m.users.id, m.users.full_name as string]),
  );

  const inFlight = active
    .map((c: any) => ({
      commitment_id: c.id,
      title: c.title,
      owner_id: c.owner_id,
      owner_name: ownerName.get(c.owner_id) ?? null,
      status: c.status,
      due_date: c.due_date,
      overdue: Boolean(c.due_date && c.due_date < today),
    }))
    .sort((a: any, b: any) => Number(b.overdue) - Number(a.overdue))
    .slice(0, 12);

  // Blockers come from both what people said and what the system escalated.
  const blockerTexts = [
    ...answered.map((p: any) => p.blocker_text).filter(Boolean),
    ...(escalations ?? []).map((e: any) => e.reason).filter(Boolean),
  ];
  const needTexts = answered.map((p: any) => p.needs_text).filter(Boolean);

  const [topBlockers, needs] = await Promise.all([
    clusterText(blockerTexts, "blocker"),
    clusterText(needTexts, "need"),
  ]);

  const pulseBlocked = answered.filter((p: any) => p.status === "blocked").length;
  const pulseAtRisk = answered.filter((p: any) => p.status === "at_risk").length;
  const pulseOnTrack = answered.filter((p: any) => p.status === "on_track" || p.status === "done").length;

  // --- Velocity and forecast ------------------------------------------------
  const recentlyDone = rows.filter(
    (c: any) => c.status === "done" && (c.resolved_at ?? c.updated_at) >= since28,
  );
  const donePoints28 = recentlyDone.reduce((sum: number, c: any) => sum + pointsFor(c.priority), 0);
  const velocityPerWeek = round2(donePoints28 / 4);

  const remainingPoints = Math.max(0, totalPoints - donePoints);
  const blockedShare = answered.length ? pulseBlocked / answered.length : 0;
  // Blocked people are not delivering, so the forecast uses a discounted rate
  // rather than pretending recent velocity will simply continue.
  const effectiveVelocity = velocityPerWeek * (1 - 0.5 * blockedShare);

  let forecastDate: string | null = null;
  let forecastConfidence: number | null = null;
  let forecastBasis: string;

  if (remainingPoints === 0) {
    forecastDate = today;
    forecastConfidence = 0.95;
    forecastBasis = "All tracked work on this project is complete.";
  } else if (effectiveVelocity <= 0) {
    forecastBasis =
      donePoints28 === 0
        ? "No work has completed in the last 28 days, so there is no rate to project from."
        : "Everyone reporting is currently blocked, so no completion rate can be projected.";
  } else {
    const weeks = remainingPoints / effectiveVelocity;
    const date = new Date(Date.now() + weeks * 7 * DAY_MS);
    forecastDate = date.toISOString().slice(0, 10);
    // Confidence rises with how much completed work the rate is based on and
    // how many people actually replied to their pulse.
    const responseRate = (members ?? []).length ? answered.length / (members ?? []).length : 0;
    forecastConfidence = round2(
      Math.max(0.2, Math.min(0.9, 0.3 + Math.min(0.35, recentlyDone.length * 0.05) + responseRate * 0.25)),
    );
    forecastBasis = `${round2(effectiveVelocity)} points/week over the last 28 days, ${round2(remainingPoints)} points remaining${
      blockedShare > 0 ? `, discounted for ${Math.round(blockedShare * 100)}% of people reporting blocked` : ""
    }.`;
  }

  // --- Health ---------------------------------------------------------------
  const overdueRate = open.length ? overdue.length / open.length : 0;
  const slipsTarget = Boolean(
    project.target_date && forecastDate && forecastDate > project.target_date,
  );

  let health: "on_track" | "at_risk" | "off_track" = "on_track";
  if (overdueRate > 0.3 || pulseBlocked >= 2 || (escalations ?? []).length >= 2) {
    health = "off_track";
  } else if (overdueRate > 0.15 || pulseBlocked >= 1 || pulseAtRisk >= 2 || slipsTarget) {
    health = "at_risk";
  }
  if (!rows.length) health = "on_track";

  await db.from("project_progress_snapshots").upsert(
    {
      org_id: org.id,
      project_id: project.id,
      as_of: asOf,
      total_points: round2(totalPoints),
      done_points: round2(donePoints),
      progress_pct: progressPct,
      commitments_total: rows.length,
      commitments_done: rows.filter((c: any) => c.status === "done").length,
      commitments_active: active.length,
      commitments_overdue: overdue.length,
      commitments_blocked: rows.filter((c: any) => c.status === "escalated").length,
      open_escalations: (escalations ?? []).length,
      pulses_sent: (pulses ?? []).length,
      pulses_responded: answered.length,
      pulse_on_track: pulseOnTrack,
      pulse_at_risk: pulseAtRisk,
      pulse_blocked: pulseBlocked,
      member_breakdown: memberBreakdown,
      top_blockers: topBlockers,
      needs,
      in_flight: inFlight,
      velocity_per_week: velocityPerWeek,
      forecast_completion_date: forecastDate,
      forecast_confidence: forecastConfidence,
      forecast_basis: forecastBasis,
      health,
    },
    { onConflict: "project_id,as_of" },
  );

  await db
    .from("projects")
    .update({
      progress_pct: progressPct,
      health,
      forecast_completion_date: forecastDate,
      last_progress_at: new Date().toISOString(),
    })
    .eq("id", project.id);
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

  const asOf = body.as_of ?? new Date().toISOString().slice(0, 10);

  const { data: orgs } = body.org_id
    ? await db.from("organizations").select("id, name, settings").eq("id", body.org_id)
    : await db.from("organizations").select("id, name, settings");

  let count = 0;
  for (const org of orgs ?? []) {
    let query = db
      .from("projects")
      .select("id, name, status, target_date")
      .eq("org_id", org.id)
      .in("status", ["active", "on_hold"]);
    if (body.project_id) query = query.eq("id", body.project_id);

    const { data: projects } = await query;
    for (const project of projects ?? []) {
      try {
        await snapshotProject(db, org, project, asOf);
        count++;
      } catch (_e) {
        // Skip this project; the next nightly run retries.
      }
    }
  }

  return json({ snapshots: count, as_of: asOf });
});
