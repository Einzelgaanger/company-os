import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Link2, Quote, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CommitmentStatusBadge, PriorityBadge } from "@/components/badges";
import { StatusChip, WaitingTime } from "@/components/flow";
import { TableSkeleton, ErrorState, EmptyState } from "@/components/states";
import { SendCheckinDialog } from "@/components/SendCheckinDialog";
import { SensitivityBadge, TagChips } from "@/components/governance";
import { ClassifyDialog } from "@/components/ClassifyDialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { canAccess, db } from "@/lib/db";
import type { FlowState } from "@/lib/flow";
import { FLOW_STATE_LABEL } from "@/lib/flow";
import {
  roleAtLeast,
  type Checkin,
  type Commitment,
  type CommitmentDependency,
  type CommitmentFeedback,
  type CommitmentStatusHistory,
  type Escalation,
  type Meeting,
  type Tag,
  type User,
} from "@/lib/types";
import { MEETING_CATEGORY_LABEL } from "@/lib/quality";
import { Lock } from "lucide-react";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FlowTimeline = {
  summary: string;
  flowState: string;
  waitingDays: number;
  workingDays: number;
  segments: Array<{ state: string; from: string; to: string; workingDays: number; kind: string }>;
};

export default function CommitmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [deps, setDeps] = useState<CommitmentDependency[]>([]);
  const [linkCandidates, setLinkCandidates] = useState<Commitment[]>([]);
  const [titleById, setTitleById] = useState<Map<string, string>>(new Map());
  const [feedback, setFeedback] = useState<CommitmentFeedback[]>([]);
  const [history, setHistory] = useState<CommitmentStatusHistory[]>([]);
  const [blockBy, setBlockBy] = useState<string>("");
  const [flowTimeline, setFlowTimeline] = useState<FlowTimeline | null>(null);

  async function load() {
    if (!user || !id) return;
    setLoading(true);
    setError(false);
    try {
      const c = await db.getCommitment(id);
      if (!c) {
        setError(true);
        return;
      }
      const [cks, allEsc, allUsers, allTags, d, fb, hist, allC] = await Promise.all([
        db.listCheckinsForCommitment(id),
        db.listEscalations(user.org_id),
        db.listUsers(user.org_id),
        db.listTags(user.org_id),
        db.listDependencies(id),
        db.listFeedback(id),
        db.listStatusHistory(id),
        db.listCommitments(user.org_id),
      ]);
      setCommitment(c);
      setCheckins(cks);
      setEscalations(allEsc.filter((e) => e.commitment_id === id));
      setUsers(allUsers);
      setTags(allTags);
      setDeps(d);
      setFeedback(fb);
      setHistory(hist);
      setTitleById(new Map(allC.map((x) => [x.id, x.title])));
      setLinkCandidates(allC.filter((x) => x.id !== id && x.status !== "done"));
      setMeeting(c.source_meeting_id ? (await db.getMeeting(c.source_meeting_id)) ?? null : null);
      void db.logDataAccess(user, "commitment", c.id, c.sensitivity ?? "internal", "view");

      if (apiConfigured()) {
        try {
          const flow = await api.commitmentFlow(id);
          setFlowTimeline(flow);
        } catch {
          setFlowTimeline(null);
        }
      } else {
        setFlowTimeline(null);
      }
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

  if (loading) return <TableSkeleton />;
  if (error || !commitment) return <ErrorState onRetry={load} />;

  if (user && !canAccess(user, commitment.sensitivity, commitment.owner_id, commitment.requested_by_id)) {
    return (
      <EmptyState
        illustration={<Lock className="h-10 w-10 text-slate" />}
        title="Restricted by data governance"
        description={`This item is classified ${commitment.sensitivity ?? "internal"}. Your role doesn't have clearance to view it. Ask an admin if you need access.`}
      />
    );
  }

  const canManage = user ? roleAtLeast(user.role, "manager") : false;
  const isOwner = commitment.owner_id === user?.id;
  const ownerName = commitment.owner_id ? userMap.get(commitment.owner_id)?.full_name : commitment.owner_external_name;
  const requesterName = commitment.requested_by_id ? userMap.get(commitment.requested_by_id)?.full_name : "—";

  async function markDone() {
    if (!user || !commitment) return;
    await db.markCommitmentDone(user, commitment.id);
    toast("Marked as done.", "success");
    load();
  }

  async function escalateNow() {
    if (!user || !commitment) return;
    const to =
      users.find((u) => u.role === "manager" || u.role === "admin" || u.role === "owner")?.id ??
      user.manager_id ??
      user.id;
    await db.escalateNow(user, commitment.id, to, "Manual escalate from commitment detail");
    toast("Escalated.", "success");
    load();
  }

  async function reassignOwner(ownerId: string) {
    if (!user || !commitment) return;
    await db.reassignCommitment(user, commitment.id, ownerId);
    toast("Reassigned.", "success");
    load();
  }

  async function editDue(due: string) {
    if (!commitment) return;
    await db.updateCommitment(commitment.id, { due_date: due || null });
    toast("Due date updated.", "success");
    load();
  }

  async function updateProgress(pct: number) {
    if (!commitment) return;
    await db.updateCommitment(commitment.id, { progress_pct: pct });
    toast("Progress updated.", "success");
    load();
  }

  async function flagNotCommitment() {
    if (!user || !commitment) return;
    await db.updateCommitment(commitment.id, { not_a_commitment: true, needs_review: false, status: "done", resolved_at: new Date().toISOString() });
    toast("Flagged as not a commitment.", "success");
    navigate("/commitments");
  }

  async function sendFeedback(label: "accurate" | "incorrect") {
    if (!user || !commitment) return;
    await db.submitFeedback(
      user,
      commitment.id,
      label,
      label === "incorrect" ? "other" : null,
      null
    );
    toast(label === "accurate" ? "Thanks — marked accurate." : "Logged as incorrect.", "success");
    load();
  }

  async function addDep() {
    if (!user || !commitment || !blockBy) return;
    await db.addDependency(user.org_id, commitment.id, blockBy);
    setBlockBy("");
    toast("Dependency linked.", "success");
    load();
  }

  const confPct =
    commitment.confidence_score != null ? Math.round(commitment.confidence_score * 100) : null;

  return (
    <div className="portal-page animate-fade-in">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PageHeader
        title={commitment.title}
        actions={
          <div className="flex flex-wrap gap-2">
            {commitment.needs_review && canManage && (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await db.approveReview(user!, commitment.id);
                    toast("Approved.", "success");
                    load();
                  }}
                >
                  Approve review
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await db.rejectReview(user!, commitment.id);
                    toast("Rejected.", "success");
                    navigate("/review");
                  }}
                >
                  Reject
                </Button>
              </>
            )}
            {(isOwner || canManage) && commitment.status !== "done" && (
              <Button variant="outline" onClick={markDone}>
                <CheckCircle2 className="h-4 w-4" /> Mark as done
              </Button>
            )}
            {canManage && commitment.status !== "done" && (
              <>
                <Button variant="outline" onClick={() => void escalateNow()}>
                  Escalate now
                </Button>
                <select
                  className="rounded-md border px-2 py-1 text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) void reassignOwner(e.target.value);
                  }}
                >
                  <option value="">Reassign…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="rounded-md border px-2 py-1 text-xs"
                  defaultValue={commitment.due_date ?? ""}
                  onChange={(e) => void editDue(e.target.value)}
                  title="Edit due date"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 rounded-md border px-2 py-1 text-xs"
                  placeholder="%"
                  defaultValue={commitment.progress_pct ?? ""}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) void updateProgress(n);
                  }}
                  title="Progress %"
                />
                <Button variant="outline" onClick={() => void flagNotCommitment()}>
                  Not a commitment
                </Button>
              </>
            )}
            {canManage && commitment.owner_id && (
              <SendCheckinDialog
                users={users}
                presetUserId={commitment.owner_id}
                commitmentId={commitment.id}
                commitmentTitle={commitment.title}
                onSent={load}
              />
            )}
            {canManage && <ClassifyDialog commitment={commitment} tags={tags} onSaved={load} />}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <CommitmentStatusBadge status={commitment.status} />
        <PriorityBadge priority={commitment.priority} />
        {commitment.needs_review && (
          <span className="rounded bg-amber/15 px-2 py-0.5 text-xs font-medium text-amber">Needs review</span>
        )}
        {confPct != null && (
          <span className="font-mono text-xs text-slate">{confPct}% confidence</span>
        )}
        {commitment.snoozed_until && (
          <span className="text-xs text-slate">Snoozed until {formatDate(commitment.snoozed_until)}</span>
        )}
        <span className="text-slate">
          Owner: <span className="font-medium text-ink">{ownerName ?? "—"}</span>
        </span>
        <span className="text-slate">
          Requested by: <span className="font-medium text-ink">{requesterName}</span>
        </span>
        <span className="font-mono text-slate">Due {formatDate(commitment.due_date)}</span>
      </div>

      {flowTimeline ? (
        <Card>
          <CardHeader>
            <CardTitle>Flow timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WaitingTime
              state={(flowTimeline.flowState as FlowState) || "ready"}
              workingDays={flowTimeline.waitingDays}
            />
            <p className="font-mono text-sm font-medium text-ink">{flowTimeline.summary}</p>
            <ol className="space-y-2 border-l-2 border-border pl-3">
              {flowTimeline.segments.map((seg, i) => (
                <li key={`${seg.from}-${i}`} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip state={seg.state as FlowState} />
                    <span className="font-mono text-xs text-slate">
                      {seg.workingDays} working day{seg.workingDays === 1 ? "" : "s"} · {seg.kind}
                    </span>
                  </div>
                  <div className="text-xs text-slate">
                    {FLOW_STATE_LABEL[seg.state as FlowState] ?? seg.state} ·{" "}
                    {formatDateTime(seg.from)} → {formatDateTime(seg.to)}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-slate">Governance</span>
        <SensitivityBadge sensitivity={commitment.sensitivity} />
        <TagChips tags={commitment.tag_ids ?? []} allTags={tags} />
        {commitment.classified_by === "system" && (
          <span className="text-xs text-slate">· auto-classified</span>
        )}
      </div>

      {commitment.description && <p className="text-sm text-slate">{commitment.description}</p>}

      {commitment.source_quote && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Quote className="h-4 w-4" /> Source quote
            </CardTitle>
          </CardHeader>
          <CardContent>
            <blockquote className="border-l-2 border-teal pl-3 text-sm italic text-ink">
              “{commitment.source_quote}”
            </blockquote>
          </CardContent>
        </Card>
      )}

      {meeting && (
        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-ink">{meeting.title}</div>
              <div className="text-xs text-slate">
                Detected from meeting on {formatDate(meeting.occurred_at)}
                {meeting.category && (
                  <> · {MEETING_CATEGORY_LABEL[meeting.category]}</>
                )}
              </div>
            </div>
            {meeting.transcript_url && (
              <a href={meeting.transcript_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-teal hover:underline">
                View transcript <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Blocked by
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deps.length === 0 ? (
            <p className="text-sm text-slate">No dependencies.</p>
          ) : (
            <ul className="space-y-2">
              {deps.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link to={`/commitments/${d.blocked_by_id}`} className="text-teal hover:underline">
                    {titleById.get(d.blocked_by_id) ?? d.blocked_by_id}
                  </Link>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await db.removeDependency(d.id);
                        load();
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && linkCandidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-64">
                <Select value={blockBy} onValueChange={setBlockBy}>
                  <SelectTrigger>
                    <SelectValue placeholder="Link a blocker…" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkCandidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" disabled={!blockBy} onClick={() => void addDep()}>
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extraction feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void sendFeedback("accurate")}>
              <ThumbsUp className="h-4 w-4" /> Accurate
            </Button>
            <Button variant="outline" size="sm" onClick={() => void sendFeedback("incorrect")}>
              <ThumbsDown className="h-4 w-4" /> Incorrect
            </Button>
          </div>
          {feedback.length > 0 && (
            <ul className="space-y-1 text-xs text-slate">
              {feedback.map((f) => (
                <li key={f.id}>
                  {f.label}
                  {f.error_category ? ` (${f.error_category})` : ""} · {formatDateTime(f.created_at)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-slate">
                  <span className="font-mono text-xs">{formatDateTime(h.created_at)}</span>
                  <span className="text-ink">
                    {h.from_status ?? "—"} → {h.to_status}
                  </span>
                  <span className="text-xs">via {h.channel}</span>
                  {h.note && <span className="text-xs">· {h.note}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Check-in history</CardTitle>
        </CardHeader>
        <CardContent>
          {checkins.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate">No check-ins yet.</p>
          ) : (
            <div className="space-y-3">
              {checkins.map((c) => {
                const outbound = c.direction === "outbound";
                return (
                  <div key={c.id} className={cn("flex", outbound ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                        outbound ? "bg-secondary text-ink" : "bg-teal/10 text-ink"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate">
                        <span className="font-medium">{outbound ? "Loop" : userMap.get(c.user_id)?.full_name ?? "Reply"}</span>
                        <span className="font-mono">{formatDateTime(c.created_at)}</span>
                      </div>
                      <p>{c.message_text}</p>
                      {c.parsed_status && (
                        <div className="mt-1 text-xs text-slate">
                          Parsed as <span className="font-medium">{c.parsed_status}</span>
                          {c.parsed_blocker ? ` — ${c.parsed_blocker}` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {escalations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red" /> Escalation history
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {escalations.map((e) => (
              <Link
                key={e.id}
                to={`/escalations/${e.id}`}
                className="block rounded-md border border-border p-3 hover:bg-secondary/50"
              >
                <div className="text-sm text-ink">
                  Escalated to <span className="font-medium">{userMap.get(e.escalated_to_id)?.full_name ?? "—"}</span>
                </div>
                <div className="text-xs text-slate">{e.reason}</div>
                <div className="font-mono text-xs text-slate">{formatDateTime(e.created_at)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
