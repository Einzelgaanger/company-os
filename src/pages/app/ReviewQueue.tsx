import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Pencil, UserPlus, X, Quote, ShieldQuestion, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommitmentStatusBadge, PriorityBadge } from "@/components/badges";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured, type ApiReviewItem } from "@/lib/api";
import { db, visibleCommitments } from "@/lib/db";
import { t } from "@/lib/copy";
import { roleAtLeast, type Commitment, type Priority, type CommitmentStatus, type User } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type StaleItem = ApiReviewItem & {
  needsLook?: boolean;
  prompt?: string;
  needsLookReason?: string | null;
};

function mapApiItem(item: ApiReviewItem): Commitment {
  return {
    id: item.id,
    org_id: "",
    title: item.title,
    description: null,
    status: item.status as CommitmentStatus,
    priority: item.priority as Priority,
    needs_review: item.needsReview,
    owner_id: item.ownerUserId,
    project_id: item.projectId,
    due_date: null,
    owner_external_name: null,
    requested_by_id: null,
    source_type: "meeting",
    source_meeting_id: null,
    source_quote: null,
    confidence_score: null,
    last_checkin_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
  };
}

export default function ReviewQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<Commitment[]>([]);
  const [stale, setStale] = useState<StaleItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [reassignId, setReassignId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      if (apiConfigured()) {
        const res = await api.listReview();
        setItems(res.items.map(mapApiItem));
        setStale(res.stale ?? []);
        setUsers([]);
        setSource("api");
      } else {
        const [queue, allUsers, allC] = await Promise.all([
          db.listReviewQueue(user.org_id),
          db.listUsers(user.org_id),
          db.listCommitments(user.org_id),
        ]);
        setItems(visibleCommitments(user, queue, allUsers));
        setUsers(allUsers);
        setStale(
          allC
            .filter((c) => (c as Commitment & { needs_look?: boolean }).needs_look)
            .map((c) => ({
              id: c.id,
              title: c.title,
              status: c.status,
              priority: c.priority,
              needsReview: false,
              ownerUserId: c.owner_id ?? "",
              projectId: c.project_id,
              prompt: "This item may need a look — the last update was a while ago.",
            })),
        );
        setSource("mock");
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const canReview = user ? roleAtLeast(user.role, "manager") : false;

  async function confirm(id: string) {
    if (!user) return;
    setBusyId(id);
    try {
      if (apiConfigured()) await api.confirmReview(id);
      else await db.approveReview(user, id);
      toast("Confirmed — item is live.", "success");
      await load();
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function discard(id: string) {
    if (!user) return;
    setBusyId(id);
    try {
      if (apiConfigured()) await api.rejectReview(id);
      else await db.discardReview(user, id);
      toast("Discarded.", "success");
      await load();
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function editThenConfirm(id: string) {
    if (!user || !editTitle.trim()) return;
    setBusyId(id);
    try {
      if (apiConfigured()) {
        await api.confirmReview(id);
      } else {
        await db.editThenConfirmReview(user, id, { title: editTitle.trim() });
      }
      setEditingId(null);
      toast("Edited and confirmed.", "success");
      await load();
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function reassign(id: string, ownerId: string) {
    if (!user) return;
    setBusyId(id);
    try {
      if (!apiConfigured()) await db.reassignCommitment(user, id, ownerId);
      setReassignId(null);
      toast("Reassigned.", "success");
      await load();
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;
  if (loading) return <TableSkeleton />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Review queue"
        description={
          source === "api"
            ? "Needs confirming and Might be stale — via @loop/api."
            : "Confirm extractions, and look at items that may have gone quiet."
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate">Needs confirming</h2>
        {items.length === 0 ? (
          <EmptyState
            illustration={<ShieldQuestion className="h-10 w-10 text-slate" />}
            title={t("C-REVIEW-EMPTY")}
          />
        ) : (
          <div className="space-y-3">
            {items.map((c) => {
              const owner = c.owner_id
                ? userMap.get(c.owner_id)?.full_name ?? "Owner"
                : c.owner_external_name ?? "Unassigned";
              const conf =
                c.confidence_score != null ? Math.round(c.confidence_score * 100) : null;
              return (
                <Card key={c.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/commitments/${c.id}`} className="font-medium text-ink hover:underline">
                          {c.title}
                        </Link>
                        <CommitmentStatusBadge status={c.status} />
                        <PriorityBadge priority={c.priority} />
                        {conf != null && (
                          <span className="rounded bg-amber/15 px-2 py-0.5 font-mono text-xs text-amber">
                            {conf}% confidence
                          </span>
                        )}
                      </div>
                      {c.review_reason ? (
                        <p className="text-sm text-amber">Reason: {c.review_reason}</p>
                      ) : null}
                      <div className="text-sm text-slate">
                        Owner: <span className="text-ink">{owner}</span>
                        {c.due_date && (
                          <>
                            {" · "}Due <span className="font-mono">{formatDate(c.due_date)}</span>
                          </>
                        )}
                      </div>
                      {c.source_quote && (
                        <blockquote className="flex gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-ink">
                          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                          <span className="italic">“{c.source_quote}”</span>
                        </blockquote>
                      )}
                      {editingId === c.id && (
                        <div className="flex gap-2">
                          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                          <Button size="sm" className="btn-primary" onClick={() => void editThenConfirm(c.id)}>
                            Save & confirm
                          </Button>
                        </div>
                      )}
                      {reassignId === c.id && (
                        <select
                          className="rounded-md border px-2 py-1 text-sm"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) void reassign(c.id, e.target.value);
                          }}
                        >
                          <option value="">Choose owner…</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {canReview && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => void confirm(c.id)}>
                          <Check className="h-4 w-4" /> Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c.id}
                          onClick={() => {
                            setEditingId(c.id);
                            setEditTitle(c.title);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c.id || source === "api"}
                          onClick={() => setReassignId(c.id)}
                        >
                          <UserPlus className="h-4 w-4" /> Reassign
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => void discard(c.id)}>
                          <X className="h-4 w-4" /> Discard
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate">Might be stale</h2>
        {stale.length === 0 ? (
          <EmptyState
            illustration={<Clock className="h-10 w-10 text-slate" />}
            title="Nothing looks stale right now."
            description="Items flagged by corroboration appear here — never as a person score."
          />
        ) : (
          <div className="space-y-3">
            {stale.map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-2 p-4">
                  <Link to={`/commitments/${c.id}`} className="font-medium text-ink hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-sm text-ink">
                    {c.prompt ?? "This has been quiet for a while. Still moving?"}
                  </p>
                  {c.needsLookReason ? (
                    <p className="text-xs text-slate">{c.needsLookReason}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
