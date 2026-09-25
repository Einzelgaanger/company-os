import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommitmentStatusBadge, PriorityBadge, ProjectStatusBadge } from "@/components/badges";
import { FeverChart, readFever } from "@/components/flow";
import { StatusDot } from "@/components/StatusDot";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { AddCommitmentDialog } from "@/components/AddCommitmentDialog";
import { ProjectRoom } from "@/components/project/ProjectRoom";
import { useAuth } from "@/context/AuthContext";
import { db, projectHealth } from "@/lib/db";
import { computeProjectProgress } from "@/lib/progress";
import { flowStateOf } from "@/lib/flow";
import { deriveProjectSnapshot } from "@/lib/projectSnapshot";
import {
  roleAtLeast,
  type Commitment,
  type Meeting,
  type Milestone,
  type Project,
  type ProjectProgressSnapshot,
  type User,
} from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [snapshot, setSnapshot] = useState<ProjectProgressSnapshot | null>(null);

  async function load() {
    if (!user || !id) return;
    setLoading(true);
    setError(false);
    try {
      const p = await db.getProject(id);
      if (!p) {
        setError(true);
        return;
      }
      const [allC, allM, allU, ms, pm, stored] = await Promise.all([
        db.listCommitments(user.org_id),
        db.listMeetings(user.org_id),
        db.listUsers(user.org_id),
        db.listMilestones(id),
        db.listProjectMembers(id),
        db.getProjectProgress(id).catch(() => undefined),
      ]);
      const projectCommitments = allC.filter((c) => c.project_id === id);
      const linkedMeetingIds = new Set(
        projectCommitments.map((c) => c.source_meeting_id).filter(Boolean),
      );
      const needles = [p.name, p.client_name, ...(p.keywords ?? [])]
        .filter((s): s is string => Boolean(s && s.length > 2))
        .map((s) => s.toLowerCase());
      setProject(p);
      setCommitments(projectCommitments);
      setMeetings(
        allM.filter((m) => {
          if (linkedMeetingIds.has(m.id) || m.project_id === id) return true;
          const hay = `${m.title ?? ""}`.toLowerCase();
          return needles.some((n) => hay.includes(n));
        }),
      );
      setUsers(allU);
      setMilestones(ms);
      setSnapshot(
        stored ??
          deriveProjectSnapshot({
            project: p,
            commitments: projectCommitments,
            users: allU,
            members: pm,
          }),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const fever = useMemo(() => {
    const open = commitments.filter((c) => c.status !== "done");
    const doneWeight = commitments.reduce((sum, c) => {
      const state = flowStateOf(c);
      if (state === "done") return sum + 1;
      if (state === "active" || state === "review") return sum + 0.5;
      return sum;
    }, 0);
    const chainCompletePct =
      commitments.length === 0 ? 0 : (doneWeight / commitments.length) * 100;
    const waitingish = open.filter((c) => {
      const s = flowStateOf(c);
      return s.startsWith("waiting_") || s === "review";
    }).length;
    const bufferConsumedDays = waitingish * 1.5;
    return readFever({
      bufferDays: project?.buffer_days ?? (commitments.length >= 3 ? 10 : null),
      bufferConsumedDays,
      chainCompletePct,
      commitmentCount: commitments.length,
      hasTargetEndDate: Boolean(project?.client_name) || commitments.length >= 3,
    });
  }, [commitments, project]);

  if (loading) return <TableSkeleton />;
  if (error || !project) return <ErrorState onRetry={load} />;

  const canManage = user ? roleAtLeast(user.role, "manager") : false;
  const progress = computeProjectProgress(commitments);

  return (
    <div className="portal-page animate-fade-in">
      <button
        onClick={() => navigate("/projects")}
        className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </button>

      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <StatusDot health={projectHealth(commitments)} />
            {canManage ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`/projects/${project.id}/settings`}>Settings</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <ProjectStatusBadge status={project.status} />
        {project.client_name && <Badge variant="outline">Client · {project.client_name}</Badge>}
        <span className="font-mono text-xs tabular-nums text-ink">{progress.label}</span>
        <span className="text-slate">
          Owner:{" "}
          <span className="font-medium text-ink">
            {project.owner_id ? userMap.get(project.owner_id)?.full_name ?? "—" : "—"}
          </span>
        </span>
      </div>

      {snapshot ? (
        <section className="space-y-4 border border-[rgba(14,31,26,0.12)] bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Delivered</p>
              <p className="text-3xl font-semibold tabular-nums text-ink">{snapshot.progress_pct}%</p>
              <p className="text-xs text-slate">
                {snapshot.done_points} of {snapshot.total_points} priority points done ·{" "}
                {snapshot.commitments_done} of {snapshot.commitments_total} items
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] uppercase tracking-wide text-slate">ETA</p>
              <p className="text-sm font-semibold text-ink">
                {snapshot.forecast_completion_date
                  ? formatDate(snapshot.forecast_completion_date)
                  : "No date yet"}
              </p>
              <p className="max-w-xs text-[11px] text-slate">{snapshot.forecast_basis}</p>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-soft">
            <div
              className="h-2 rounded-full bg-forest"
              style={{ width: `${Math.max(0, Math.min(100, snapshot.progress_pct))}%` }}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-slate">
                Main blocker
              </h3>
              {snapshot.top_blockers[0] ? (
                <p className="text-sm text-ink">{snapshot.top_blockers[0].label}</p>
              ) : (
                <p className="text-sm text-slate">Nothing is blocked right now.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-slate">
                Happening now
              </h3>
              {snapshot.in_flight.length === 0 ? (
                <p className="text-sm text-slate">No open work.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {snapshot.in_flight.slice(0, 5).map((row) => (
                    <li key={row.commitment_id} className="flex justify-between gap-3">
                      <span className="text-ink">{row.title}</span>
                      <span className="shrink-0 text-slate">{row.owner_name ?? "Unassigned"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {snapshot.member_breakdown.length > 0 ? (
            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-slate">
                By person
              </h3>
              <ul className="space-y-2">
                {snapshot.member_breakdown.map((row) => (
                  <li key={row.user_id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-ink">{row.name}</span>
                      <span className="font-mono text-xs tabular-nums text-slate">
                        {row.pct == null ? "—" : `${row.pct}%`} · {row.open_count} open
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-soft">
                      <div
                        className="h-1.5 rounded-full bg-forest/70"
                        style={{ width: `${row.pct ?? 0}%` }}
                      />
                    </div>
                    {row.active_titles[0] ? (
                      <p className="mt-0.5 text-[12px] text-slate">On: {row.active_titles.join(" · ")}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <Tabs defaultValue="room">
        <TabsList>
          <TabsTrigger value="room">Room</TabsTrigger>
          <TabsTrigger value="commitments">Commitments</TabsTrigger>
          <TabsTrigger value="flow">Flow</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="room">
          {user && (
            <ProjectRoom project={project} user={user} users={users} meetings={meetings} />
          )}
        </TabsContent>

        <TabsContent value="commitments">
          <div className="mb-3 flex justify-end">
            <AddCommitmentDialog
              users={users}
              projects={[project]}
              presetProjectId={project.id}
              onCreated={load}
            />
          </div>
          {commitments.length === 0 ? (
            <EmptyState title="No commitments tracked for this project yet." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commitments.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/commitments/${c.id}`)}
                    >
                      <TableCell className="font-medium text-ink">{c.title}</TableCell>
                      <TableCell className="text-slate">
                        {c.owner_id
                          ? userMap.get(c.owner_id)?.full_name ?? "—"
                          : c.owner_external_name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate">
                        {formatDate(c.due_date)}
                      </TableCell>
                      <TableCell>
                        <CommitmentStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={c.priority} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="flow">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Fever chart</h3>
                <p className="text-xs text-slate">
                  Buffer consumption against chain completion. Method shown beside the figure
                  (classical 10-day demo buffer until project settings wire an explicit size).
                </p>
              </div>
              <FeverChart
                bufferConsumedPct={fever.bufferConsumedPct}
                chainCompletePct={fever.chainCompletePct}
                zone={fever.zone}
                caption={fever.caption}
              />
              <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                <span className="font-medium text-ink">Buffer sizing:</span>{" "}
                <span className="text-slate">
                  {project.buffer_days
                    ? `${project.buffer_days} working days, set on this project.`
                    : "Classical 50% / demo 10 working days until an explicit buffer is set on the project."}
                </span>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Waiting on this project</h3>
                {commitments.filter((c) => flowStateOf(c).startsWith("waiting_")).length === 0 ? (
                  <p className="text-sm text-slate">Nothing waiting right now.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {commitments
                      .filter((c) => flowStateOf(c).startsWith("waiting_"))
                      .map((c) => (
                        <li key={c.id}>
                          <Link className="text-ink hover:underline" to={`/commitments/${c.id}`}>
                            {c.title}
                          </Link>
                          <span className="ml-2 font-mono text-xs text-slate">{flowStateOf(c)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones">
          {milestones.length === 0 ? (
            <EmptyState
              title="No milestones yet."
              description={canManage ? "Add them in project settings." : undefined}
              action={
                canManage ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/projects/${project.id}/settings`}>Open settings</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Linked items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell className="font-mono text-xs">{formatDate(m.due_date)}</TableCell>
                      <TableCell>{m.status}</TableCell>
                      <TableCell className="font-mono text-xs">{m.weight}</TableCell>
                      <TableCell className="font-mono text-xs">{m.commitment_ids.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="meetings">
          {meetings.length === 0 ? (
            <EmptyState
              title="No meetings linked yet."
              description="Company OS links meetings automatically when it detects a match."
            />
          ) : (
            <Card>
              <CardContent className="space-y-2 p-5">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <div className="font-medium text-ink">{m.title}</div>
                      <div className="text-xs text-slate">
                        {formatDate(m.occurred_at)} · {m.participants.length} participants ·{" "}
                        {m.processed_at ? (
                          `${m.extracted_commitments_count} commitments detected`
                        ) : (
                          <span className="text-amber">Needs review</span>
                        )}
                      </div>
                    </div>
                    {m.transcript_url && (
                      <a
                        href={m.transcript_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-teal hover:underline"
                      >
                        Transcript <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardContent className="space-y-3 p-5">
              {commitments.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate">Nothing has happened here yet.</p>
              ) : (
                [...commitments]
                  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                  .map((c) => (
                    <div key={c.id} className="flex items-start gap-3 border-l-2 border-border pl-3">
                      <div className="flex-1">
                        <div className="text-sm text-ink">
                          <span className="font-medium">{c.title}</span> —{" "}
                          {c.status.replace("_", " ")}
                        </div>
                        <div className="font-mono text-xs text-slate">
                          {formatDateTime(c.updated_at)}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <p>
                <span className="font-semibold">Method:</span> priority-weighted commitment status
                (done = 100%, active = 50%, open = 0%). Progress is never invented from elapsed time.
              </p>
              <p className="font-mono text-lg font-bold text-[#0E1F1A]">{progress.label}</p>
              {progress.lowConfidence ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  Low confidence — many items lack recent updates. Treat % as approximate.
                </p>
              ) : null}
              <p className="text-[#5B6560]">
                {milestones.filter((m) => m.status === "done").length} of {milestones.length}{" "}
                milestones done.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
