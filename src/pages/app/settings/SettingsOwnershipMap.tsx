import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { uuid } from "@/lib/utils";
import { t } from "@/lib/copy";
import type { OwnershipMapEntry, User } from "@/lib/types";

/** Local resolveEscalationOwner (mirrors @loop/shared) for Test routing. */
function resolveEscalationOwner(
  tags: string[],
  rules: { tag: string; assigneeUserId: string }[],
  fallbackUserId: string,
): { assigneeUserId: string; matchedTag: string | null } {
  for (const tag of tags) {
    const rule = rules.find((r) => r.tag.toLowerCase() === tag.toLowerCase());
    if (rule) return { assigneeUserId: rule.assigneeUserId, matchedTag: tag };
  }
  return { assigneeUserId: fallbackUserId, matchedTag: null };
}

export default function SettingsOwnershipMap() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<OwnershipMapEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [testTags, setTestTags] = useState("sharepoint, data");
  const [testResult, setTestResult] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [e, u] = await Promise.all([db.listOwnershipMap(user.org_id), db.listUsers(user.org_id)]);
    setEntries([...e].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setUsers(u);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [user]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  if (!user) return null;

  function patchLocal(id: string, patch: Partial<OwnershipMapEntry>) {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function persist(entry: OwnershipMapEntry) {
    if (!entry.category.trim() || !entry.primary_owner_id) return;
    await db.upsertOwnershipEntry(entry);
    toast("Saved.", "success");
  }

  function addRow() {
    setEntries((es) => [
      ...es,
      {
        id: uuid(),
        org_id: user!.org_id,
        category: "",
        primary_owner_id: users[0]?.id ?? "",
        backup_owner_id: null,
        sla_hours: 24,
        keywords: [],
        scope: "org",
        sort_order: es.length,
      },
    ]);
  }

  async function remove(id: string) {
    await db.removeOwnershipEntry(id);
    void load();
  }

  function move(id: string, dir: -1 | 1) {
    setEntries((es) => {
      const idx = es.findIndex((e) => e.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= es.length) return es;
      const next = [...es];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((e, i) => ({ ...e, sort_order: i }));
    });
  }

  async function saveOrder() {
    for (const e of entries) await db.upsertOwnershipEntry(e);
    toast("Order saved.", "success");
  }

  function runTest() {
    const tags = testTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const rules = entries.flatMap((e) =>
      (e.keywords?.length ? e.keywords : [e.category]).map((tag) => ({
        tag,
        assigneeUserId: e.primary_owner_id,
      })),
    );
    const fallback = user!.manager_id ?? user!.id;
    const { assigneeUserId, matchedTag } = resolveEscalationOwner(tags, rules, fallback);
    setTestResult(
      matchedTag
        ? `Matched “${matchedTag}” → ${userMap.get(assigneeUserId) ?? assigneeUserId}`
        : `No match → fallback ${userMap.get(assigneeUserId) ?? assigneeUserId}`,
    );
  }

  if (loading) return <TableSkeleton />;

  return (
    <>
      <p className="text-sm text-slate">
        Keywords, scope, and SLA tell Loop who to route escalations to. Use Test routing to verify.
      </p>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <EmptyState title={t("C-OWNMAP-EMPTY")} />
            <Button onClick={addRow}>
              <Plus className="h-4 w-4" /> Add category
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => move(e.id, -1)}>
                          ↑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => move(e.id, 1)}>
                          ↓
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={e.category}
                        onChange={(ev) => patchLocal(e.id, { category: ev.target.value })}
                        onBlur={() => persist(entries.find((x) => x.id === e.id)!)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={(e.keywords ?? []).join(", ")}
                        placeholder="tag1, tag2"
                        onChange={(ev) =>
                          patchLocal(e.id, {
                            keywords: ev.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        onBlur={() => persist(entries.find((x) => x.id === e.id)!)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-24"
                        value={e.scope ?? "org"}
                        onChange={(ev) => patchLocal(e.id, { scope: ev.target.value })}
                        onBlur={() => persist(entries.find((x) => x.id === e.id)!)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={e.primary_owner_id}
                        onValueChange={(v) => {
                          patchLocal(e.id, { primary_owner_id: v });
                          void persist({ ...e, primary_owner_id: v });
                        }}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-16 font-mono"
                        value={e.sla_hours}
                        onChange={(ev) => patchLocal(e.id, { sla_hours: Number(ev.target.value) })}
                        onBlur={() => persist(entries.find((x) => x.id === e.id)!)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => void remove(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add category
            </Button>
            <Button variant="outline" onClick={() => void saveOrder()}>
              Save order
            </Button>
          </div>
        </>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="text-sm font-bold">Test routing</h3>
          <Input
            value={testTags}
            onChange={(e) => setTestTags(e.target.value)}
            placeholder="Comma-separated tags"
          />
          <Button className="btn-primary" onClick={runTest}>
            Run test
          </Button>
          {testResult ? <p className="text-sm text-[#0E1F1A]">{testResult}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
