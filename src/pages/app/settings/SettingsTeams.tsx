import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { uuid } from "@/lib/utils";
import type { OrgTeam, User } from "@/lib/types";

export default function SettingsTeams() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");

  async function load() {
    if (!user) return;
    const [t, u] = await Promise.all([db.listOrgTeams(user.org_id), db.listUsers(user.org_id)]);
    setTeams(t);
    setUsers(u);
  }

  useEffect(() => {
    void load();
  }, [user]);

  if (!user) return null;

  async function addTeam() {
    if (!name.trim()) return;
    await db.upsertOrgTeam({
      id: uuid(),
      org_id: user!.org_id,
      name: name.trim(),
      lead_id: user!.id,
      member_ids: [user!.id],
      created_at: new Date().toISOString(),
    });
    setName("");
    toast("Team created.", "success");
    await load();
  }

  async function remove(id: string) {
    await db.removeOrgTeam(id);
    toast("Team removed.", "default");
    await load();
  }

  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-4">
      <PageHeader title="Teams" description="Org teams for routing and the Team page." />
      <ul className="space-y-2">
        {teams.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-3 text-sm"
          >
            <div>
              <div className="font-semibold text-[#0E1F1A]">{t.name}</div>
              <div className="text-[11px] text-[#5A6B7D]">
                Lead: {nameOf(t.lead_id)} · {t.member_ids.length} members
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => void remove(t.id)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          placeholder="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-glass"
        />
        <Button className="btn-primary" onClick={() => void addTeam()}>
          Add team
        </Button>
      </div>
    </div>
  );
}
