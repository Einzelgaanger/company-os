import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { roleAtLeast, type AuditLogEntry, type AuthSessionRow, type DsrRequest, type User } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function SettingsSecurity() {
  const { user, org, refresh } = useAuth();
  const { toast } = useToast();
  const [log, setLog] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [dsrs, setDsrs] = useState<DsrRequest[]>([]);
  const [sessions, setSessions] = useState<AuthSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [retention, setRetention] = useState<"6" | "12" | "24">("12");
  const [exporting, setExporting] = useState(false);

  async function load() {
    if (!user || !org) return;
    const [l, u, d, s] = await Promise.all([
      db.listAuditLog(user.org_id),
      db.listUsers(user.org_id),
      db.listDsrRequests(user.org_id),
      db.listAuthSessions(user.org_id),
    ]);
    setLog(l);
    setUsers(u);
    setDsrs(d);
    setSessions(s);
    setRetention(String(org.settings.data_retention_months ?? 12) as "6" | "12" | "24");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [user, org]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);
  const isOwner = user ? roleAtLeast(user.role, "owner") : false;

  const filtered = useMemo(
    () => log.filter((l) => (search ? (l.action + l.actor).toLowerCase().includes(search.toLowerCase()) : true)),
    [log, search],
  );

  async function saveRetention(v: "6" | "12" | "24") {
    setRetention(v);
    if (org) {
      await db.updateOrg(org.id, { settings: { ...org.settings, data_retention_months: Number(v) as 6 | 12 | 24 } });
      await refresh();
      toast("Saved.", "success");
    }
  }

  function exportAuditCsv() {
    const header = "action,actor,target_type,target_id,created_at\n";
    const rows = filtered
      .map((l) =>
        [l.action, l.actor, l.target_type ?? "", l.target_id ?? "", l.created_at]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loop-audit.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("Audit CSV downloaded.", "success");
  }

  async function fulfillDsr(id: string) {
    await db.updateDsrRequest(id, { status: "fulfilled", resolved_at: new Date().toISOString() });
    toast("DSR marked fulfilled.", "success");
    await load();
  }

  async function revokeSession(id: string) {
    await db.revokeAuthSession(id);
    toast("Session revoked.", "success");
    await load();
  }

  async function exportOrgData() {
    if (!org || !user) return;
    setExporting(true);
    try {
      const [commitments, connections, audit, dsr, projects, escalations, checkins] = await Promise.all([
        db.listCommitments(org.id),
        db.listConnections(org.id),
        db.listAuditLog(org.id),
        db.listDsrRequests(org.id),
        db.listProjects(org.id),
        db.listEscalations(org.id),
        db.listCheckins(org.id),
      ]);
      const payload = {
        organization: org,
        exported_by: user.id,
        exported_at: new Date().toISOString(),
        users,
        projects,
        commitments,
        escalations,
        checkins,
        connections,
        audit_log: audit,
        dsr_requests: dsr,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loop-org-export-${org.slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Organization export downloaded.", "success");
    } catch {
      toast("Could not build the export. Try again.", "error");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <TableSkeleton />;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Keep check-ins and audit log for</Label>
          <Select value={retention} onValueChange={(v) => saveRetention(v as "6" | "12" | "24")}>
            <SelectTrigger className="max-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">12 months</SelectItem>
              <SelectItem value="24">24 months</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Audit log</CardTitle>
          <Button size="sm" variant="outline" onClick={exportAuditCsv}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            className="max-w-xs"
            placeholder="Filter by action or actor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs text-ink">{l.action}</TableCell>
                  <TableCell className="text-slate">
                    {l.actor === "system" ? "System" : userMap.get(l.actor) ?? l.actor}
                  </TableCell>
                  <TableCell className="text-slate">{l.target_type ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-slate">{formatDateTime(l.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DSR queue</CardTitle>
        </CardHeader>
        <CardContent>
          {dsrs.length === 0 ? (
            <p className="text-sm text-slate">No open data subject requests.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dsrs.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(14,31,26,0.06)] py-2"
                >
                  <span>
                    {d.type} · {userMap.get(d.user_id) ?? d.user_id} · {d.status}
                    {d.due_at ? ` · due ${formatDate(d.due_at)}` : ""}
                  </span>
                  {d.status === "open" || d.status === "in_progress" ? (
                    <Button size="sm" onClick={() => void fulfillDsr(d.id)}>
                      Mark fulfilled
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {userMap.get(s.user_id) ?? s.user_id} · {s.device} · {s.ip ?? "—"}
                </span>
                <Button size="sm" variant="outline" onClick={() => void revokeSession(s.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Export organization data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate">
              Downloads every record Loop holds for this organization as JSON: people, projects, items,
              escalations, check-ins, connections, the audit log, and the DSR queue.
            </p>
            <Button variant="outline" disabled={exporting} onClick={() => void exportOrgData()}>
              {exporting ? "Building export…" : "Export all organization data"}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
