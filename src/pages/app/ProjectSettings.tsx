import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { uuid } from "@/lib/utils";
import type { Milestone, Project, ProjectStatus, User } from "@/lib/types";

export default function ProjectSettings() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newTitle, setNewTitle] = useState("");

  async function load() {
    if (!id || !user) return;
    const [p, u, ms] = await Promise.all([
      db.getProject(id),
      db.listUsers(user.org_id),
      db.listMilestones(id),
    ]);
    setProject(p ?? null);
    setUsers(u);
    setMilestones(ms);
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
        description="Owner, status, and milestones."
        actions={
          <Link to={`/projects/${project.id}`} className="text-sm font-semibold underline">
            Back to project
          </Link>
        }
      />

      <section className="space-y-3 rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4">
        <h2 className="text-sm font-bold text-[#0E1F1A]">Ownership & status</h2>
        <label className="block text-xs font-medium text-[#5A6B7D]">
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
        <label className="block text-xs font-medium text-[#5A6B7D]">
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
