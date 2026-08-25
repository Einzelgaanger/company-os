import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EscalationStatusBadge } from "@/components/badges";
import { LoopMotif } from "@/components/LoopMotif";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { db, scopedUserIds } from "@/lib/db";
import { roleAtLeast, type Commitment, type Escalation, type User } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

export default function Escalations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("all");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const commitmentMap = useMemo(() => new Map(commitments.map((c) => [c.id, c])), [commitments]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const scoped = useMemo(() => {
    if (!user) return [];
    const ids = new Set(scopedUserIds(user, users));
    return escalations
      .filter((e) => {
        if (roleAtLeast(user.role, "admin")) return true;
        const c = commitmentMap.get(e.commitment_id);
        if (e.escalated_to_id === user.id) return true;
        return c && ((c.owner_id && ids.has(c.owner_id)) || (c.requested_by_id && ids.has(c.requested_by_id)));
      })
      .filter((e) => filter === "all" || e.status === filter)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [escalations, user, users, commitmentMap, filter]);

  if (!user) return null;

  const chips = ["all", "open", "acknowledged", "resolved"];

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader title="Escalations" description="What actually needs a human decision right now." />

      <div className="scroll-x-pad -mx-1 flex gap-2 px-1">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={cn(
              "min-h-[36px] shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold capitalize transition-colors",
              filter === c
                ? "border-[#0E1F1A] bg-[#F4FBE3] text-[#0E1F1A]"
                : "border-[rgba(14,31,26,0.1)] text-[#5A6B7D] hover:bg-[#F7FAF6]"
            )}
          >
            {c}
          </button>
        ))}
      </div>

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
        <DataTable
          rows={scoped}
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
      )}
      <Button variant="link" className="text-[#5A6B7D]" onClick={() => navigate("/settings/ownership-map")}>
        Configure escalation routing →
      </Button>
    </div>
  );
}
