import { computeProjectProgress } from "./progress";
import type {
  Commitment,
  Project,
  ProjectHealth,
  ProjectMember,
  ProjectProgressSnapshot,
  ProgressInFlightRow,
  ProgressMemberRow,
  User,
} from "./types";

const POINTS: Record<string, number> = { critical: 5, high: 3, medium: 2, low: 1 };

function points(c: Commitment): number {
  return POINTS[c.priority] ?? 2;
}

/**
 * The picture a manager sees on a project: percent delivered, who is on what
 * right now, the main blocker, and an ETA. Built from commitments so the page
 * is populated before the nightly snapshot job has run. When that job has
 * written a row, the page prefers it.
 */
export function deriveProjectSnapshot(input: {
  project: Project;
  commitments: Commitment[];
  users: User[];
  members: ProjectMember[];
}): ProjectProgressSnapshot {
  const { project, commitments, users, members } = input;
  const names = new Map(users.map((u) => [u.id, u.full_name]));
  const tracked = commitments.filter((c) => !c.needs_review);
  const open = tracked.filter((c) => c.status !== "done");
  const done = tracked.filter((c) => c.status === "done");
  const overdue = open.filter((c) => c.status === "overdue" || c.status === "escalated");
  const active = open.filter((c) => c.status === "in_progress" || c.status === "at_risk");

  const totalPoints = tracked.reduce((sum, c) => sum + points(c), 0);
  const donePoints = done.reduce((sum, c) => sum + points(c), 0);
  const progress = computeProjectProgress(commitments);

  const byOwner = new Map<string, Commitment[]>();
  for (const c of tracked) {
    const key = c.owner_id ?? "unassigned";
    byOwner.set(key, [...(byOwner.get(key) ?? []), c]);
  }

  const memberRows: ProgressMemberRow[] = [...byOwner.entries()].map(([userId, rows]) => {
    const personDone = rows.filter((c) => c.status === "done");
    const personOpen = rows.filter((c) => c.status !== "done");
    const total = rows.reduce((sum, c) => sum + points(c), 0);
    const got = personDone.reduce((sum, c) => sum + points(c), 0);
    const member = members.find((m) => m.user_id === userId);
    const blocker = personOpen.find((c) => c.status === "escalated" || c.status === "overdue");
    return {
      user_id: userId,
      name: userId === "unassigned" ? "Unassigned" : names.get(userId) ?? "Unknown",
      role_in_project: member?.role_in_project ?? "contributor",
      total_points: total,
      done_points: got,
      pct: total === 0 ? null : Math.round((got / total) * 100),
      open_count: personOpen.length,
      overdue_count: personOpen.filter((c) => c.status === "overdue" || c.status === "escalated").length,
      active_titles: personOpen.slice(0, 3).map((c) => c.title),
      status: blocker ? "blocked" : personOpen.length ? "on_track" : "done",
      self_progress_pct: null,
      blocker: blocker?.title ?? null,
      needs: null,
      last_heard_at: null,
    };
  });

  const inFlight: ProgressInFlightRow[] = open.slice(0, 8).map((c) => ({
    commitment_id: c.id,
    title: c.title,
    owner_id: c.owner_id,
    owner_name: c.owner_id ? names.get(c.owner_id) ?? null : c.owner_external_name,
    status: c.status,
    due_date: c.due_date,
    overdue: c.status === "overdue" || c.status === "escalated",
  }));

  const blocker =
    overdue[0]?.title ??
    open.find((c) => c.status === "at_risk")?.title ??
    null;

  const dueDates = open.map((c) => c.due_date).filter((d): d is string => Boolean(d)).sort();
  const eta = project.forecast_completion_date ?? project.target_date ?? dueDates[dueDates.length - 1] ?? null;

  let health: ProjectHealth = "on_track";
  if (tracked.length === 0) health = "unknown";
  else if (overdue.length > 0) health = overdue.length >= 2 ? "off_track" : "at_risk";
  else if (open.some((c) => c.status === "at_risk")) health = "at_risk";

  const now = new Date().toISOString();
  return {
    id: `derived-${project.id}`,
    org_id: project.org_id,
    project_id: project.id,
    as_of: now.slice(0, 10),
    total_points: totalPoints,
    done_points: donePoints,
    progress_pct: Math.round(progress.pct),
    commitments_total: tracked.length,
    commitments_done: done.length,
    commitments_active: active.length,
    commitments_overdue: overdue.length,
    commitments_blocked: overdue.filter((c) => c.status === "escalated").length,
    open_escalations: overdue.filter((c) => c.status === "escalated").length,
    pulses_sent: 0,
    pulses_responded: 0,
    pulse_on_track: 0,
    pulse_at_risk: 0,
    pulse_blocked: 0,
    member_breakdown: memberRows.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
    top_blockers: blocker ? [{ label: blocker, count: overdue.length || 1 }] : [],
    needs: [],
    in_flight: inFlight,
    velocity_per_week: done.length,
    forecast_completion_date: eta,
    forecast_confidence: dueDates.length ? 0.6 : null,
    forecast_basis: project.target_date
      ? "Target date set on the project."
      : dueDates.length
        ? "Latest due date still open on this project."
        : "No due dates yet, so there is no ETA.",
    health,
    created_at: now,
  };
}
