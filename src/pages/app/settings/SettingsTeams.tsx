import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { Team, TeamMember, User } from "@/lib/types";

/**
 * Teams a manager can form and put people on. Membership here is what project
 * routing and the team page read. The older org_teams list is left alone.
 */
export default function SettingsTeams() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [addFor, setAddFor] = useState<Record<string, string>>({});

  async function load() {
    if (!user) return;
    const [t, m, u] = await Promise.all([
      db.listTeams(user.org_id),
      db.listAllTeamMembers(user.org_id),
      db.listUsers(user.org_id),
    ]);
    setTeams(t);
    setMembers(m);
    setUsers(u);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;
  const me = user;

  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? "—";

  async function addTeam() {
    if (!name.trim()) return;
    await db.createTeam({
      org_id: me.org_id,
      name: name.trim(),
      lead_user_id: me.id,
    });
    setName("");
    toast("Team created. You are the lead.", "success");
    await load();
  }

  async function addPerson(teamId: string) {
    const userId = addFor[teamId];
    if (!userId) return;
    await db.addTeamMember({
      org_id: me.org_id,
      team_id: teamId,
      user_id: userId,
      role_in_team: "member",
    });
    setAddFor((current) => ({ ...current, [teamId]: "" }));
    toast("Added to the team.", "success");
    await load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teams"
        description="Form a team, name a lead, and add the people on it. Projects can then be staffed from these teams."
      />
      <ul className="space-y-3">
        {teams.map((team) => {
          const people = members.filter((m) => m.team_id === team.id);
          const available = users.filter(
            (u) => u.status === "active" && !people.some((m) => m.user_id === u.id),
          );
          return (
            <li key={team.id} className="space-y-3 border border-[rgba(14,31,26,0.12)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{team.name}</h2>
                  <p className="text-[12px] text-slate">
                    Lead: {nameOf(team.lead_user_id)}
                    {team.description ? ` · ${team.description}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void db.deleteTeam(team.id).then(() => load());
                  }}
                >
                  Delete
                </Button>
              </div>
              <ul className="space-y-1 text-sm">
                {people.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-2">
                    <span>
                      {nameOf(m.user_id)}{" "}
                      <span className="font-mono text-[11px] uppercase text-slate">{m.role_in_team}</span>
                    </span>
                    {m.role_in_team !== "lead" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void db.removeTeamMember(team.id, m.user_id).then(() => load());
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <select
                  className="input-glass w-full rounded-md px-2 py-2 text-sm"
                  value={addFor[team.id] ?? ""}
                  onChange={(e) => setAddFor((current) => ({ ...current, [team.id]: e.target.value }))}
                >
                  <option value="">Add a person…</option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <Button className="btn-primary" disabled={!addFor[team.id]} onClick={() => void addPerson(team.id)}>
                  Add
                </Button>
              </div>
            </li>
          );
        })}
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
