import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SensitivityBadge, TagChip } from "@/components/governance";
import { TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db, governanceStats, visibleCommitments } from "@/lib/db";
import {
  roleAtLeast,
  SENSITIVITY_LABEL,
  type Commitment,
  type DataAccessLogEntry,
  type Sensitivity,
  type Tag,
  type User,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const SENS_BAR: Record<Sensitivity, string> = {
  public: "bg-green",
  internal: "bg-teal",
  confidential: "bg-amber",
  restricted: "bg-red",
};

export default function Governance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accessLog, setAccessLog] = useState<DataAccessLogEntry[]>([]);

  // new-tag form
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState<Sensitivity>("confidential");
  const [newPii, setNewPii] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const [allC, allU, t, log] = await Promise.all([
        db.listCommitments(user.org_id),
        db.listUsers(user.org_id),
        db.listTags(user.org_id),
        db.listDataAccessLog(user.org_id),
      ]);
      setCommitments(visibleCommitments(user, allC, allU));
      setUsers(allU);
      setTags(t);
      setAccessLog(log);
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

  const stats = useMemo(() => governanceStats(commitments), [commitments]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);
  const canEditTags = user ? roleAtLeast(user.role, "admin") : false;

  if (!user) return null;
  if (loading) return <TableSkeleton />;
  if (error) return <ErrorState onRetry={load} />;

  async function createTag() {
    if (!user || !newName.trim()) return;
    await db.createTag({
      org_id: user.org_id,
      name: newName.trim().toLowerCase(),
      color: newClass === "restricted" ? "red" : newClass === "confidential" ? "amber" : "teal",
      classification: newClass,
      pii: newPii,
      description: null,
    });
    setNewName("");
    setNewPii(false);
    toast("Saved.", "success");
    load();
  }

  const coveragePct = Math.round(stats.coverage * 100);

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Data governance"
        description="Classification, tagging, and access — so sensitive data is handled correctly everywhere Loop touches it."
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="access">Access log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-slate">Classification coverage</div>
                <div className="mt-1 font-display text-3xl font-semibold text-ink">{coveragePct}%</div>
                <div className="mt-3 h-2 w-full rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-teal" style={{ width: `${coveragePct}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate">{stats.classified} of {stats.total} commitments classified</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-slate">Needs classification</div>
                <div className="mt-1 font-display text-3xl font-semibold text-ink">{stats.untagged.length}</div>
                <div className="mt-2 text-xs text-slate">Sensitive items with no tags</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-slate">Policy violations</div>
                <div className="mt-1 font-display text-3xl font-semibold text-ink">{stats.violations.length}</div>
                <div className="mt-2 text-xs text-slate">Sensitive data at governance risk</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Classification distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Object.keys(stats.byClassification) as Sensitivity[]).map((s) => {
                const count = stats.byClassification[s];
                const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-ink">{SENSITIVITY_LABEL[s]}</div>
                    <div className="h-3 flex-1 rounded-full bg-secondary">
                      <div className={`h-3 rounded-full ${SENS_BAR[s]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-10 text-right font-mono text-xs text-slate">{count}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {stats.violations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-red" /> Governance violations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.violations.map((v) => (
                  <button
                    key={v.commitment.id}
                    onClick={() => navigate(`/commitments/${v.commitment.id}`)}
                    className="flex w-full items-center justify-between rounded-md border border-red/30 bg-red/5 p-3 text-left hover:bg-red/10"
                  >
                    <div>
                      <div className="font-medium text-ink">{v.commitment.title}</div>
                      <div className="text-xs text-red">{v.issue}</div>
                    </div>
                    <SensitivityBadge sensitivity={v.commitment.sensitivity} />
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {stats.untagged.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Needs classification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.untagged.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/commitments/${c.id}`)}
                    className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left hover:bg-secondary/50"
                  >
                    <span className="font-medium text-ink">{c.title}</span>
                    <SensitivityBadge sensitivity={c.sensitivity} />
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          {canEditTags && (
            <Card>
              <CardHeader>
                <CardTitle>Add tag</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. client data" className="w-48" />
                </div>
                <div className="space-y-1.5">
                  <Label>Default classification</Label>
                  <Select value={newClass} onValueChange={(v) => setNewClass(v as Sensitivity)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="confidential">Confidential</SelectItem>
                      <SelectItem value="restricted">Restricted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Checkbox checked={newPii} onCheckedChange={(v) => setNewPii(Boolean(v))} /> PII / regulated
                </label>
                <Button onClick={createTag} disabled={!newName.trim()}>
                  <Plus className="h-4 w-4" /> Add tag
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Default classification</TableHead>
                  <TableHead>PII</TableHead>
                  <TableHead>Description</TableHead>
                  {canEditTags && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><TagChip tag={t} /></TableCell>
                    <TableCell><SensitivityBadge sensitivity={t.classification} /></TableCell>
                    <TableCell className="text-slate">{t.pii ? "Yes" : "—"}</TableCell>
                    <TableCell className="text-slate">{t.description ?? "—"}</TableCell>
                    {canEditTags && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            await db.deleteTag(t.id);
                            load();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal" /> Data access log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {accessLog.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate">No sensitive-data access recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Sensitivity</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessLog.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="pl-5 text-ink">{userMap.get(l.actor_id) ?? l.actor_id}</TableCell>
                        <TableCell className="font-mono text-xs text-slate">{l.action}</TableCell>
                        <TableCell className="text-slate">{l.entity_type}</TableCell>
                        <TableCell><SensitivityBadge sensitivity={l.sensitivity} /></TableCell>
                        <TableCell className="font-mono text-xs text-slate">{formatDateTime(l.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
