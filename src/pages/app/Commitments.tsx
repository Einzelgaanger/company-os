import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommitmentStatusBadge, PriorityBadge } from "@/components/badges";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { AddCommitmentDialog } from "@/components/AddCommitmentDialog";
import { useAuth } from "@/context/AuthContext";
import { db, visibleCommitments, PRIORITY_RANK } from "@/lib/db";
import { roleAtLeast, type Commitment, type Project, type User } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const STATUS_ORDER: Record<string, number> = {
  escalated: 0,
  overdue: 1,
  at_risk: 2,
  in_progress: 3,
  open: 4,
  done: 5,
};

export default function Commitments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const statusFilter = params.get("status") ?? "all";
  const priorityFilter = params.get("priority") ?? "all";
  const projectFilter = params.get("project") ?? "all";
  const reviewFilter = params.get("review") ?? "all";

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const [all, allUsers, allProjects] = await Promise.all([
        db.listCommitments(user.org_id),
        db.listUsers(user.org_id),
        db.listProjects(user.org_id),
      ]);
      setCommitments(visibleCommitments(user, all, allUsers));
      setUsers(allUsers);
      setProjects(allProjects);
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

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const isManager = user ? roleAtLeast(user.role, "manager") : false;
  const reviewCount = useMemo(() => commitments.filter((c) => c.needs_review).length, [commitments]);

  const filtered = useMemo(() => {
    return commitments
      .filter((c) => statusFilter === "all" || c.status === statusFilter)
      .filter((c) => priorityFilter === "all" || c.priority === priorityFilter)
      .filter((c) => projectFilter === "all" || c.project_id === projectFilter)
      .filter((c) => {
        if (reviewFilter === "needs") return !!c.needs_review;
        if (reviewFilter === "live") return !c.needs_review;
        return true;
      })
      .sort((a, b) => {
        const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (s !== 0) return s;
        const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
        if (p !== 0) return p;
        return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      });
  }, [commitments, statusFilter, priorityFilter, projectFilter, reviewFilter]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next);
  }

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Commitments"
        subtitle={isManager ? "Everything owed across your scope." : "What you owe, tracked automatically."}
        actions={
          <div className="flex flex-wrap gap-2">
            {isManager && reviewCount > 0 && (
              <Button variant="outline" asChild>
                <Link to="/review">{reviewCount} need review</Link>
              </Button>
            )}
            <AddCommitmentDialog users={users} projects={projects} onCreated={load} />
          </div>
        }
      />

      <div className="portal-toolbar flex-wrap">
        <div className="portal-filter">
          <Select value={statusFilter} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="portal-filter--md portal-filter">
          <Select value={reviewFilter} onValueChange={(v) => setFilter("review", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Review" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All (incl. review)</SelectItem>
              <SelectItem value="live">Live only</SelectItem>
              <SelectItem value="needs">Needs review</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="portal-filter">
          <Select value={priorityFilter} onValueChange={(v) => setFilter("priority", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="portal-filter--lg portal-filter">
          <Select value={projectFilter} onValueChange={(v) => setFilter("project", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing owed right now"
          description="Loop will populate this automatically from your meetings and messages."
          illustration={
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#D3F36B]/25 text-[#0E1F1A]">
              <ListChecks className="h-5 w-5" strokeWidth={1.75} />
            </span>
          }
        />
      ) : (
        <DataTable
          rows={filtered}
          onRowClick={(c) => navigate(`/commitments/${c.id}`)}
          columns={[
            {
              key: "title",
              header: "Title",
              primary: true,
              cell: (c) => (
                <span className="inline-flex flex-wrap items-center gap-2 font-medium text-[#0E1F1A]">
                  {c.title}
                  {c.needs_review && <StatusBadge tone="pending">Review</StatusBadge>}
                </span>
              ),
            },
            {
              key: "project",
              header: "Project",
              cell: (c) => (c.project_id ? projectMap.get(c.project_id)?.name ?? "—" : "—"),
            },
            ...(isManager
              ? [
                  {
                    key: "owner",
                    header: "Owner",
                    cell: (c: Commitment) =>
                      c.owner_id ? userMap.get(c.owner_id)?.full_name ?? "—" : c.owner_external_name ?? "—",
                  },
                ]
              : []),
            {
              key: "due",
              header: "Due",
              cell: (c) => <span className="font-mono text-xs">{formatDate(c.due_date)}</span>,
            },
            {
              key: "status",
              header: "Status",
              cell: (c) => <CommitmentStatusBadge status={c.status} />,
            },
            {
              key: "priority",
              header: "Priority",
              cell: (c) => <PriorityBadge priority={c.priority} />,
            },
          ]}
        />
      )}
    </div>
  );
}
