import { useMemo, useState } from "react";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SensitivityBadge, TagChip, TagChips } from "@/components/governance";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { PROVIDERS } from "@/lib/providers";
import { compareRules, describeRule, labelIngestedItem } from "@/lib/ingestionPolicy";
import {
  INGESTION_CONTENT_LABEL,
  SENSITIVITY_LABEL,
  type ConnectionProvider,
  type IngestionContentKind,
  type IngestionLabelRule,
  type IngestionMatchType,
  type Sensitivity,
  type Tag,
} from "@/lib/types";

const LEVELS: Sensitivity[] = ["public", "internal", "confidential", "restricted"];
const KINDS = Object.keys(INGESTION_CONTENT_LABEL) as IngestionContentKind[];
const ANY = "__any__";

const providerName = (id: ConnectionProvider) =>
  PROVIDERS.find((p) => p.id === id)?.name ?? id;
const contentLabel = (k: IngestionContentKind) => INGESTION_CONTENT_LABEL[k];

interface NewRule {
  name: string;
  provider: ConnectionProvider | null;
  content_kind: IngestionContentKind | null;
  match_type: IngestionMatchType;
  match_value: string;
  sensitivity: Sensitivity;
  tag_ids: string[];
}

const BLANK: NewRule = {
  name: "",
  provider: null,
  content_kind: "email",
  match_type: "all",
  match_value: "",
  sensitivity: "confidential",
  tag_ids: [],
};

/**
 * Classification applied to everything connected apps pull in: an org-wide
 * floor plus rules that raise it for specific sources or content.
 */
export function IngestionRules({
  rules,
  tags,
  defaultClassification,
  canEdit,
  onChanged,
}: {
  rules: IngestionLabelRule[];
  tags: Tag[];
  defaultClassification: Sensitivity;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<NewRule>(BLANK);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // Test bench
  const [testKind, setTestKind] = useState<IngestionContentKind>("email");
  const [testProvider, setTestProvider] = useState<ConnectionProvider>("gmail");
  const [testText, setTestText] = useState("");
  const [testFrom, setTestFrom] = useState("");

  const ordered = useMemo(() => [...rules].sort(compareRules), [rules]);

  const testResult = useMemo(
    () =>
      labelIngestedItem(
        {
          provider: testProvider,
          kind: testKind,
          title: testText,
          from_address: testFrom || null,
        },
        rules,
        defaultClassification,
      ),
    [testProvider, testKind, testText, testFrom, rules, defaultClassification],
  );

  async function setDefault(next: Sensitivity) {
    if (!user) return;
    setBusy(true);
    try {
      await db.updateOrg(user.org_id, { settings: { default_classification: next } });
      toast(`Everything pulled in now starts at ${SENSITIVITY_LABEL[next].toLowerCase()}.`, "success");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addRule() {
    if (!user || !draft.name.trim()) return;
    if (draft.match_type !== "all" && !draft.match_value.trim()) {
      toast("Give the rule something to match on.", "error");
      return;
    }
    setBusy(true);
    try {
      await db.createIngestionRule(user, {
        org_id: user.org_id,
        name: draft.name.trim(),
        provider: draft.provider,
        content_kind: draft.content_kind,
        match_type: draft.match_type,
        match_value: draft.match_type === "all" ? null : draft.match_value.trim(),
        sensitivity: draft.sensitivity,
        tag_ids: draft.tag_ids,
        enabled: true,
      });
      setDraft(BLANK);
      setAdding(false);
      toast("Rule added. It applies to everything pulled in from now on.", "success");
      onChanged();
    } catch {
      toast("Could not save the rule.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: IngestionLabelRule, enabled: boolean) {
    if (!user) return;
    await db.updateIngestionRule(user, rule.id, { enabled });
    onChanged();
  }

  async function remove(rule: IngestionLabelRule) {
    if (!user) return;
    await db.deleteIngestionRule(user, rule.id);
    toast("Rule removed.", "default");
    onChanged();
  }

  function toggleDraftTag(id: string) {
    setDraft((d) => ({
      ...d,
      tag_ids: d.tag_ids.includes(id) ? d.tag_ids.filter((t) => t !== id) : [...d.tag_ids, id],
    }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Default for everything pulled in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>Baseline classification</Label>
            <Select
              value={defaultClassification}
              onValueChange={(v) => void setDefault(v as Sensitivity)}
              disabled={!canEdit || busy}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>{SENSITIVITY_LABEL[l]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="max-w-lg flex-1 text-xs text-slate">
            Every email, calendar event, transcript, chat message, and file a connected app hands
            over starts here. Rules below can only raise it — nothing is ever quietly downgraded.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Rules</CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
              <Plus className="h-4 w-4" /> Add rule
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {adding && canEdit && (
            <div className="space-y-3 rounded-md border border-teal/40 bg-teal/5 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Rule name</Label>
                  <Input
                    value={draft.name}
                    placeholder="e.g. Email is confidential"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Select
                    value={draft.provider ?? ANY}
                    onValueChange={(v) =>
                      setDraft({ ...draft, provider: v === ANY ? null : (v as ConnectionProvider) })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Any connected app</SelectItem>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Applies to</Label>
                  <Select
                    value={draft.content_kind ?? ANY}
                    onValueChange={(v) =>
                      setDraft({
                        ...draft,
                        content_kind: v === ANY ? null : (v as IngestionContentKind),
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Everything</SelectItem>
                      {KINDS.map((k) => (
                        <SelectItem key={k} value={k}>{INGESTION_CONTENT_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Label it</Label>
                  <Select
                    value={draft.sensitivity}
                    onValueChange={(v) => setDraft({ ...draft, sensitivity: v as Sensitivity })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{SENSITIVITY_LABEL[l]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Match</Label>
                  <Select
                    value={draft.match_type}
                    onValueChange={(v) => setDraft({ ...draft, match_type: v as IngestionMatchType })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everything from this source</SelectItem>
                      <SelectItem value="keyword">Contains a keyword</SelectItem>
                      <SelectItem value="from_domain">Sent from a domain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.match_type !== "all" && (
                  <div className="space-y-1.5">
                    <Label>{draft.match_type === "keyword" ? "Keyword" : "Domain"}</Label>
                    <Input
                      value={draft.match_value}
                      placeholder={draft.match_type === "keyword" ? "payroll" : "client.com"}
                      onChange={(e) => setDraft({ ...draft, match_value: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Also apply these tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleDraftTag(t.id)}
                      className={draft.tag_ids.includes(t.id) ? "" : "opacity-40"}
                    >
                      <TagChip tag={t} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate">
                  Tags carry their own audience, so tagging here also decides who can read the data.
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => void addRule()} disabled={busy || !draft.name.trim()}>
                  Save rule
                </Button>
                <Button variant="ghost" onClick={() => { setAdding(false); setDraft(BLANK); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {ordered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate">
              No rules yet — everything lands at the baseline above.
            </p>
          ) : (
            ordered.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{rule.name}</span>
                    <SensitivityBadge sensitivity={rule.sensitivity} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate">
                    {describeRule(rule, providerName, contentLabel)}
                  </div>
                  {rule.tag_ids.length > 0 && (
                    <div className="mt-1.5">
                      <TagChips tags={rule.tag_ids} allTags={tags} />
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate">
                      {rule.enabled ? "On" : "Off"}
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => void toggle(rule, Boolean(v))}
                      />
                    </label>
                    <Button variant="ghost" size="icon" onClick={() => void remove(rule)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-teal" /> Test an incoming item
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate">
            Runs the same rule evaluation the ingestion pipeline uses, so what you see here is what
            gets stored.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From source</Label>
              <Select value={testProvider} onValueChange={(v) => setTestProvider(v as ConnectionProvider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Content kind</Label>
              <Select value={testKind} onValueChange={(v) => setTestKind(v as IngestionContentKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{INGESTION_CONTENT_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject or text</Label>
              <Input
                value={testText}
                placeholder="Q3 payroll review"
                onChange={(e) => setTestText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sender (optional)</Label>
              <Input
                value={testFrom}
                placeholder="finance@client.com"
                onChange={(e) => setTestFrom(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/40 p-3">
            <SensitivityBadge sensitivity={testResult.sensitivity} />
            <TagChips tags={testResult.tag_ids} allTags={tags} />
            <span className="text-xs text-slate">{testResult.rationale}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
