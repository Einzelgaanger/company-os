import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, ShieldCheck, Trash2, TriangleAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SensitivityBadge, TagChip } from "@/components/governance";
import { IngestionRules } from "@/components/shared/IngestionRules";
import { TagEditorDialog } from "@/components/dialogs/TagEditorDialog";
import { ReleaseCallDialog } from "@/components/dialogs/ReleaseCallDialog";
import { TableSkeleton, ErrorState } from "@/components/states";
import { pageOf, Pager } from "@/components/shared/Pager";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db, governanceStats, visibleCommitments } from "@/lib/db";
import { audienceCount, audienceSummary, isRestrictedAudience } from "@/lib/tagAccess";
import {
  roleAtLeast,
  SENSITIVITY_LABEL,
  type Commitment,
  type DataAccessLogEntry,
  type IngestionLabelRule,
  type Meeting,
  type Organization,
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
  const [rules, setRules] = useState<IngestionLabelRule[]>([]);
  const [org, setOrg] = useState<Organization | undefined>();
  const [heldCalls, setHeldCalls] = useState<Meeting[]>([]);
  const [releasing, setReleasing] = useState<Meeting | null>(null);
  const [logPage, setLogPage] = useState(0);

  // null = closed; { tag: null } = creating a new tag
  const [editing, setEditing] = useState<{ tag: Tag | null } | null>(null);

  /**
   * `silent` refetches in place after an edit. Without it the page swaps itself
   * for a skeleton, which remounts the tabs and throws the admin back to
   * Overview mid-task.
   */
  async function load({ silent = false } = {}) {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(false);
    try {
      const [allC, allU, t, log, r, o, held] = await Promise.all([
        db.listCommitments(user.org_id),
        db.listUsers(user.org_id),
        db.listTags(user.org_id),
        db.listDataAccessLog(user.org_id),
        db.listIngestionRules(user.org_id),
        db.getOrg(user.org_id),
        db.listHeldMeetings(user.org_id),
      ]);
      setCommitments(visibleCommitments(user, allC, allU, t));
      setUsers(allU);
      setTags(t);
      setAccessLog(log);
      setRules(r);
      setOrg(o);
      setHeldCalls(held);
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
  if (error) return <ErrorState onRetry={() => load()} />;

  const refresh = () => load({ silent: true });

  async function removeTag(tag: Tag) {
    await db.deleteTag(tag.id);
    toast(`"${tag.name}" removed and detached from all data.`, "default");
    refresh();
  }

  const coveragePct = Math.round(stats.coverage * 100);

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Classification & access"
        description="Tags, sensitivity, and who can see what. Ingestion rules live in Settings."
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calls">
            Incoming calls
            {heldCalls.length > 0 && (
              <Badge variant="amber" className="ml-1.5">{heldCalls.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sources">Connected apps</TabsTrigger>
          <TabsTrigger value="tags">Tags &amp; access</TabsTrigger>
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

        <TabsContent value="calls" className="space-y-4">
          <p className="max-w-2xl text-sm text-slate">
            Connected mail and meetings land here first and stay held until you tag them.
            Tagging is what stores the item. Commitments extracted from it inherit that tag.
          </p>
          {heldCalls.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-slate">
                Nothing waiting. Mail and meetings from a connected app show up here after the next sync.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {heldCalls.map((m) => (
                <Card key={m.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium">{m.title ?? "Untitled call"}</div>
                      <div className="text-xs text-slate">
                        {formatDateTime(m.occurred_at ?? m.ingested_at)} · {m.source} ·{" "}
                        {m.participants.map((p) => p.name).join(", ") || "No participants"}
                      </div>
                      {m.transcript_text && (
                        <p className="line-clamp-2 text-sm text-slate">{m.transcript_text}</p>
                      )}
                    </div>
                    <Button onClick={() => setReleasing(m)}>Tag &amp; store</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sources">
          <IngestionRules
            rules={rules}
            tags={tags}
            defaultClassification={org?.settings.default_classification ?? "internal"}
            canEdit={canEditTags}
            onChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-slate">
              A tag classifies data <em>and</em> decides who can read it. Pick the audience the same
              way you would on WhatsApp — everyone, only certain people, everyone except someone, or
              by role — then use the tag to label an email, meeting, or commitment.
            </p>
            {canEditTags && (
              <Button onClick={() => setEditing({ tag: null })}>
                <Plus className="h-4 w-4" /> New tag
              </Button>
            )}
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Default classification</TableHead>
                  <TableHead>Who can see it</TableHead>
                  <TableHead>PII</TableHead>
                  {canEditTags && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <TagChip tag={t} />
                      {t.description && (
                        <div className="mt-1 text-xs text-slate">{t.description}</div>
                      )}
                    </TableCell>
                    <TableCell><SensitivityBadge sensitivity={t.classification} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-ink">
                        <Users className="h-3.5 w-3.5 shrink-0 text-slate" />
                        {audienceSummary(t, users)}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-slate">
                          {audienceCount(t, users)} of {users.length} people
                        </span>
                        {isRestrictedAudience(t) && <Badge variant="amber">Limited</Badge>}
                        {t.audience?.admin_override === false && (
                          <Badge variant="red">Admins excluded</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate">{t.pii ? "Yes" : "—"}</TableCell>
                    {canEditTags && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${t.name}`}
                            onClick={() => setEditing({ tag: t })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${t.name}`}
                            onClick={() => void removeTag(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <TagEditorDialog
            open={editing !== null}
            tag={editing?.tag ?? null}
            users={users}
            onOpenChange={(o) => !o && setEditing(null)}
            onSaved={refresh}
          />
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
                    {pageOf(accessLog, logPage, 25).map((l) => (
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
              <div className="px-5 py-3">
                <Pager page={logPage} pageSize={25} total={accessLog.length} onPage={setLogPage} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ReleaseCallDialog
        meeting={releasing}
        tags={tags}
        users={users}
        open={releasing !== null}
        onOpenChange={(o) => !o && setReleasing(null)}
        onStored={refresh}
      />
    </div>
  );
}
