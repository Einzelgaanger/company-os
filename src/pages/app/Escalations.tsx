import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EscalationStatusBadge } from "@/components/badges";
import { LoopMotif } from "@/components/LoopMotif";
import { DataTable } from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { pageOf, Pager } from "@/components/shared/Pager";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { db, scopedUserIds } from "@/lib/db";
import { roleAtLeast, URGENCY_RANK, type Commitment, type Escalation, type UrgencyBand, type User } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

export default function Escalations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("mine");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const [e, c, u] = await Promise.all([
        db.listEscalations(user.org_id),
        db.listCommitments(user.org_id),
        db.listUsers(user.org_id),
      ]);
      setEscalations(e);
      setCommitments(c);
      setUsers(u);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (user && roleAtLeast(user.role, "admin")) setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const commitmentMap = useMemo(() => new Map(commitments.map((c) => [c.id, c])), [commitments]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const visible = useMemo(() => {
    if (!user) return [];
    const ids = new Set(scopedUserIds(user, users));
    return escalations.filter((e) => {
      if (roleAtLeast(user.role, "admin")) return true;
      const c = commitmentMap.get(e.commitment_id);
      if (e.escalated_to_id === user.id) return true;
      return c && ((c.owner_id && ids.has(c.owner_id)) || (c.requested_by_id && ids.has(c.requested_by_id)));
    });
  }, [escalations, user, users, commitmentMap]);

  const scoped = useMemo(() => {
    if (!user) return [];
    return visible
      .filter((e) => {
        if (filter === "all") return true;
        if (filter === "mine") return e.escalated_to_id === user.id;
        return e.status === filter;
      })
      .filter((e) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const title = commitmentMap.get(e.commitment_id)?.title ?? "";
        return `${title} ${e.reason}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const score = (e: Escalation) =>
          e.urgency_score ??
          (e.urgency_band ? URGENCY_RANK[e.urgency_band] * 25 : 0);
        return score(b) - score(a) || b.created_at.localeCompare(a.created_at);
      });
  }, [visible, user, filter, query, commitmentMap]);

  if (!user) return null;

  const chips = ["mine", "all", "open", "acknowledged", "resolved"];

  function bandLabel(band: UrgencyBand | null | undefined, score: number | null | undefined) {
    if (band) return band;
    if (score == null) return "unscored";
    if (score >= 72) return "critical";
    if (score >= 48) return "high";
    if (score >= 24) return "medium";
    return "low";
  }

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Escalations"
        description="Your queue, most urgent first. Company OS ranks these from how late, how blocked, and how often they have already been raised."
      />

      <div className="scroll-x-pad -mx-1 flex gap-2 px-1">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setFilter(c);
              setPage(0);
            }}
            className={cn(
              "min-h-[36px] shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold capitalize transition-colors",
              filter === c
                ? "border-[#0E1F1A] bg-[#F4FBE3] text-[#0E1F1A]"
                : "border-[rgba(14,31,26,0.1)] text-[#5B6560] hover:bg-[#F8F8F7]"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <Input
        value={query}
        placeholder="Search escalations"
        className="max-w-sm"
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : scoped.length === 0 ? (
        <EmptyState
          illustration={<LoopMotif size={180} activeStep={5} />}
          title="Nothing escalated"
          description="Everything's moving on its own."
        />
      ) : (
        <div className="space-y-3">
        <DataTable
          rows={pageOf(scoped, page, 25)}
          onRowClick={(e) => navigate(`/escalations/${e.id}`)}
          columns={[
            {
              key: "commitment",
              header: "Commitment",
              primary: true,
              cell: (e) => (
                <span className="font-medium text-[#0E1F1A]">
                  {commitmentMap.get(e.commitment_id)?.title ?? "—"}
                </span>
              ),
            },
            {
              key: "to",
              header: "Escalated to",
              cell: (e) => userMap.get(e.escalated_to_id)?.full_name ?? "—",
            },
            {
              key: "reason",
              header: "Reason",
              cell: (e) => <span className="line-clamp-2">{e.reason}</span>,
            },
            {
              key: "urgency",
              header: "Urgency",
              cell: (e) => {
                const band = bandLabel(e.urgency_band, e.urgency_score);
                return (
                  <span className="font-mono text-xs uppercase">
                    {band}
                    {e.urgency_score != null ? ` · ${e.urgency_score}` : ""}
                  </span>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              cell: (e) => <EscalationStatusBadge status={e.status} />,
            },
            {
              key: "open",
              header: "Open for",
              cell: (e) => (
                <span className="font-mono text-xs">{e.resolved_at ? "—" : timeAgo(e.created_at)}</span>
              ),
            },
          ]}
        />
        <Pager page={page} pageSize={25} total={scoped.length} onPage={setPage} />
        </div>
      )}
      {roleAtLeast(user.role, "admin") ? (
        <Button variant="link" className="text-[#5B6560]" onClick={() => navigate("/settings/ownership-map")}>
          Configure escalation routing →
        </Button>
      ) : null}
    </div>
  );
}
