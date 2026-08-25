import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { RoleBadge } from "@/components/badges";
import { InviteDialog } from "@/components/InviteDialog";
import { DataTable } from "@/components/shared/DataTable";
import { TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { db, scopedUserIds } from "@/lib/db";
import { flowStateOf, isOpenState, isWaitingState } from "@/lib/flow";
import { roleAtLeast, type Commitment, type User } from "@/lib/types";

/**
 * Team directory — 08_PAGES §8.10.
 * Allowed columns only: Name · Role · Team · open queue · waiting on them.
 * No overdue/response/WhatsApp/health scores (no per-person performance metrics).
 */
export default function Team() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [search, setSearch] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string; member_ids: string[] }[]>([]);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const [u, c, t] = await Promise.all([
        db.listUsers(user.org_id),
        db.listCommitments(user.org_id),
        db.listOrgTeams(user.org_id),
      ]);
      setUsers(u);
      setCommitments(c);
      setTeams(t);
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

  const scoped = useMemo(() => {
    if (!user) return [];
    const ids = new Set(scopedUserIds(user, users));
    return users
      .filter((u) => (roleAtLeast(user.role, "admin") ? true : ids.has(u.id)))
      .filter((u) => u.id !== user.id)
      .filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()));
  }, [users, user, search]);

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Team"
        description="Who owns what queue — factual work counts only, never performance scores."
        actions={roleAtLeast(user.role, "admin") ? <InviteDialog onInvited={load} /> : undefined}
      />

      <div className="portal-toolbar">
        <div className="w-full min-w-0 max-w-md">
          <Input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : (
        <DataTable
          rows={scoped}
          onRowClick={(member) => navigate(`/team/${member.id}`)}
          empty="No teammates match this search."
          columns={[
            {
              key: "name",
              header: "Name",
              primary: true,
              cell: (m) => <span className="font-medium text-[var(--brand-ink)]">{m.full_name}</span>,
            },
            {
              key: "role",
              header: "Role",
              cell: (m) => <RoleBadge role={m.role} />,
            },
            {
              key: "team",
              header: "Team",
              cell: (m) => {
                const team = teams.find((t) => t.member_ids.includes(m.id));
                return <span className="text-xs">{team?.name ?? "—"}</span>;
              },
            },
            {
              key: "queue",
              header: "Open queue",
              cell: (m) => {
                const open = commitments.filter((c) => {
                  if (c.owner_id !== m.id) return false;
                  return isOpenState(flowStateOf(c));
                }).length;
                return <span className="font-mono text-xs">{open}</span>;
              },
            },
            {
              key: "waiting_on",
              header: "Waiting on them",
              cell: (m) => {
                const n = commitments.filter((c) => {
                  const state = flowStateOf(c);
                  if (!isWaitingState(state)) return false;
                  const waitingOn =
                    (c as Commitment & { waiting_on_user_id?: string | null }).waiting_on_user_id ??
                    null;
                  return waitingOn === m.id;
                }).length;
                return <span className="font-mono text-xs">{n}</span>;
              },
            },
          ]}
        />
      )}
    </div>
  );
}
