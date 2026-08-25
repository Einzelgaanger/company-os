import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectStatusBadge } from "@/components/badges";
import { StatusDot } from "@/components/StatusDot";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { db, projectHealth } from "@/lib/db";
import { computeProjectProgress } from "@/lib/progress";
import { roleAtLeast, type Commitment, type Project, type User } from "@/lib/types";

export default function Projects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const [p, c, u] = await Promise.all([
        db.listProjects(user.org_id),
        db.listCommitments(user.org_id),
        db.listUsers(user.org_id),
      ]);
      setProjects(p);
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

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const canCreate = user ? roleAtLeast(user.role, "manager") : false;

  const rows = useMemo(
    () => projects.filter((p) => statusFilter === "all" || p.status === statusFilter),
    [projects, statusFilter]
  );

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Projects"
        description="Health at a glance across everything Loop is watching."
        actions={
          canCreate ? (
            <Button onClick={() => navigate("/projects/new")} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" /> New project
            </Button>
          ) : undefined
        }
      />

      <div className="portal-toolbar">
        <div className="portal-filter">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Group commitments and meetings under a project to track health."
          action={canCreate ? <Button onClick={() => navigate("/projects/new")}>Create your first project</Button> : undefined}
        />
      ) : (
        <DataTable
          rows={rows}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
          columns={[
            {
              key: "name",
              header: "Name",
              primary: true,
              cell: (p) => <span className="font-medium text-[#0E1F1A]">{p.name}</span>,
            },
            {
              key: "client",
              header: "Client",
              cell: (p) => p.client_name ?? "—",
            },
            {
              key: "owner",
              header: "Owner",
              cell: (p) => (p.owner_id ? userMap.get(p.owner_id)?.full_name ?? "—" : "—"),
            },
            {
              key: "status",
              header: "Status",
              cell: (p) => <ProjectStatusBadge status={p.status} />,
            },
            {
              key: "open",
              header: "Open",
              cell: (p) => {
                const open = commitments.filter((c) => c.project_id === p.id && c.status !== "done").length;
                return <span className="font-mono text-xs">{open}</span>;
              },
            },
            {
              key: "progress",
              header: "Progress",
              cell: (p) => {
                const { label } = computeProjectProgress(
                  commitments.filter((c) => c.project_id === p.id),
                );
                return <span className="font-mono text-xs tabular-nums">{label}</span>;
              },
            },
            {
              key: "health",
              header: "Health",
              cell: (p) => (
                <StatusDot health={projectHealth(commitments.filter((c) => c.project_id === p.id))} />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
