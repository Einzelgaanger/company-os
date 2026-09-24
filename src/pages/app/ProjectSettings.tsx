import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { uuid } from "@/lib/utils";
import type { Milestone, Project, ProjectMember, ProjectRole, ProjectStatus, User } from "@/lib/types";

export default function ProjectSettings() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("contributor");

  async function load() {
    if (!id || !user) return;
    const [p, u, ms, pm] = await Promise.all([
      db.getProject(id),
      db.listUsers(user.org_id),
      db.listMilestones(id),
      db.listProjectMembers?.(id) ?? Promise.resolve([]),
    ]);
    setProject(p ?? null);
    setUsers(u);
    setMilestones(ms);
    setMembers(pm);
  }

  useEffect(() => {
    void load();
  }, [id, user]);

  if (!user) return null;
  if (!project) {
    return (
      <div className="portal-page">
        <PageHeader title="Project settings" description="Not found." />
      </div>
    );
  }

  async function saveMeta(patch: Partial<Project>) {
    const next = await db.updateProject(project!.id, patch);
    setProject(next);
    toast("Saved.", "success");
  }

  async function addMilestone() {
    if (!newTitle.trim() || !user) return;
    const m: Milestone = {
      id: uuid(),
      org_id: user.org_id,
      project_id: project!.id,
      title: newTitle.trim(),
      due_date: null,
      status: "pending",
      weight: 1,
      commitment_ids: [],
      created_at: new Date().toISOString(),
    };
    await db.upsertMilestone(m);
    setNewTitle("");
    await load();
    toast("Milestone added.", "success");
  }

  async function removeMs(msId: string) {
    await db.removeMilestone(msId);
    await load();
  }

  return (
    <div className="portal-page animate-fade-in space-y-6">
      <PageHeader
        title={`${project.name} · settings`}
        description="Owner, people, status, and milestones."
        actions={
          <Link to={`/projects/${project.id}`} className="text-sm font-semibold underline">
            Back to project
          </Link>
        }
      />

      <section className="space-y-3 rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4">
        <h2 className="text-sm font-bold text-[#0E1F1A]">Ownership & status</h2>
        <label className="block text-xs font-medium text-[#5B6560]">
          Owner
          <select
            className="mt-1 w-full rounded-md border border-[rgba(14,31,26,0.15)] bg-white px-2 py-2 text-sm"
            value={project.owner_id ?? ""}
            onChange={(e) => void saveMeta({ owner_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-[#5B6560]">
          Status
          <select
            className="mt-1 w-full rounded-md border border-[rgba(14,31,26,0.15)] bg-white px-2 py-2 text-sm"
            value={project.status}
            onChange={(e) => void saveMeta({ status: e.target.value as ProjectStatus })}
          >
            {(["active", "on_hold", "completed", "archived"] as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-ink">People on this project</h2>
        <ul className="space-y-2">
          {members.map((m) => {
            const person = users.find((u) => u.id === m.user_id);
            return (
              <li key={`${m.project_id}-${m.user_id}`} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {person?.full_name ?? m.user_id} · {m.role_in_project}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await db.removeProjectMember?.(project.id, m.user_id);
                    await load();
                    toast("Removed.", "success");
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
          {members.length === 0 ? <li className="text-sm text-slate">No one added yet besides the owner.</li> : null}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="input-glass w-full rounded-md px-2 py-2 text-sm"
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
          >
            <option value="">Add a person…</option>
            {users
              .filter((u) => u.status === "active" && !members.some((m) => m.user_id === u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
          </select>
          <select
            className="input-glass rounded-md px-2 py-2 text-sm"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as ProjectRole)}
          >
            {(["lead", "contributor", "reviewer", "observer"] as ProjectRole[]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button
            className="btn-primary"
            disabled={!addUserId}
            onClick={async () => {
              if (!addUserId) return;
              await db.addProjectMember?.({
                org_id: user.org_id,
                project_id: project.id,
                user_id: addUserId,
                role_in_project: addRole,
              });
              setAddUserId("");
              await load();
              toast("Added to project.", "success");
            }}
          >
            Add
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4">
        <h2 className="text-sm font-bold text-[#0E1F1A]">Milestones</h2>
        <ul className="space-y-2">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {m.title} · {m.status} · w{m.weight}
              </span>
              <Button size="sm" variant="outline" onClick={() => void removeMs(m.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="New milestone"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="input-glass"
          />
          <Button className="btn-primary" onClick={() => void addMilestone()}>
            Add
          </Button>
        </div>
      </section>
    </div>
  );
}
