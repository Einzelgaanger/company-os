import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";

type Rule = {
  id: string;
  type: string;
  value: string;
  scope: string;
  reason: string;
};

const DEFAULTS: Rule[] = [
  { id: "1", type: "keyword", value: "salary", scope: "all", reason: "HR default" },
  { id: "2", type: "keyword", value: "disciplinary", scope: "all", reason: "HR default" },
  { id: "3", type: "meeting_title_pattern", value: "^1:1", scope: "meetings", reason: "Private 1:1s" },
];

/** §4.5 / §8.9 — ingestion exclusions persist via API when configured. */
export default function SettingsDataGovernance() {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>(DEFAULTS);
  const [testInput, setTestInput] = useState("");
  const [scope, setScope] = useState<"user" | "meeting" | "keyword" | "domain">("keyword");
  const [matchValue, setMatchValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"api" | "defaults">("defaults");

  async function load() {
    if (!apiConfigured()) {
      setRules(DEFAULTS);
      setSource("defaults");
      return;
    }
    try {
      const res = await api.listExclusions();
      setSource("api");
      setRules(
        res.items.map((r) => ({
          id: r.id,
          type: r.scope,
          value: r.matchValue,
          scope: r.scope,
          reason: r.reason ?? "",
        })),
      );
    } catch {
      toast("Could not load exclusions.", "error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const excluded30d = useMemo(
    () => [
      { type: "keyword", count: rules.filter((r) => r.type === "keyword").length },
      { type: "meeting", count: rules.filter((r) => r.type === "meeting").length },
      { type: "domain", count: rules.filter((r) => r.type === "domain").length },
      { type: "user", count: rules.filter((r) => r.type === "user").length },
    ],
    [rules],
  );

  function testRule() {
    const hit = rules.find((r) => {
      if (r.type === "keyword") return testInput.toLowerCase().includes(r.value.toLowerCase());
      if (r.type === "meeting" || r.type === "meeting_title_pattern") {
        try {
          return new RegExp(r.value, "i").test(testInput);
        } catch {
          return testInput.toLowerCase().includes(r.value.toLowerCase());
        }
      }
      return testInput.toLowerCase().includes(r.value.toLowerCase());
    });
    toast(
      hit ? `Would be excluded by ${hit.type}: ${hit.value}` : "Would not be excluded.",
      hit ? "default" : "success",
    );
  }

  async function addRule() {
    if (!matchValue.trim()) return;
    if (!apiConfigured()) {
      toast("Connect VITE_API_URL to persist exclusions.", "default");
      return;
    }
    setBusy(true);
    try {
      await api.createExclusion({
        scope,
        matchValue: matchValue.trim(),
        reason: reason.trim() || undefined,
      });
      setMatchValue("");
      setReason("");
      toast("Exclusion saved.", "success");
      await load();
    } catch {
      toast("Could not save exclusion.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(id: string) {
    if (!apiConfigured()) return;
    setBusy(true);
    try {
      await api.deleteExclusion(id);
      toast("Removed.", "success");
      await load();
    } catch {
      toast("Could not remove.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data governance"
        subtitle="What Loop must never read — evaluated before any content is fetched."
      />
      <div className="portal-callout">
        Filters fail closed. Derived commitments inherit source visibility (§4.5 Layer 2).
        {source === "api" ? " Rules are stored in ingestion_exclusions." : " Showing built-in defaults until the API is connected."}
      </div>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Active rules by type</h2>
            <p className="portal-section__desc">Counts of configured exclusions</p>
          </div>
        </header>
        <div className="portal-section__body--pad grid gap-2 sm:grid-cols-4">
          {excluded30d.map((row) => (
            <div key={row.type} className="rounded-md border border-[#0E1F1A]/6 bg-[#f7faf6] p-2">
              <div className="text-[10px] font-semibold uppercase text-[#5A6B7D]">{row.type}</div>
              <div className="text-lg font-bold text-[#0E1F1A]">{row.count}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Exclusion rules</h2>
            <p className="portal-section__desc">{rules.length} active</p>
          </div>
        </header>
        <div className="divide-y divide-[rgba(14,31,26,0.06)]">
          {rules.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <span className="font-mono text-xs font-semibold uppercase text-[#5A6B7D]">{r.type}</span>
                <span className="ml-2 font-medium text-[#0E1F1A]">{r.value}</span>
                <span className="ml-2 text-[11px] text-[#5A6B7D]">scope: {r.scope}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#5A6B7D]">{r.reason}</span>
                {source === "api" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void removeRule(r.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {source === "api" ? (
          <div className="portal-section__body--pad grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="keyword">keyword</option>
              <option value="meeting">meeting</option>
              <option value="domain">domain</option>
              <option value="user">user</option>
            </select>
            <Input
              className="field-input"
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder="Match value"
            />
            <Input
              className="field-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
            />
            <Button type="button" disabled={busy || !matchValue.trim()} onClick={() => void addRule()}>
              Add
            </Button>
          </div>
        ) : null}
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Test a rule</h2>
            <p className="portal-section__desc">Paste a subject or meeting title</p>
          </div>
        </header>
        <div className="portal-section__body--pad flex gap-2">
          <Input
            className="field-input"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="e.g. Q2 salary review 1:1"
          />
          <Button type="button" variant="secondary" onClick={testRule}>
            Test
          </Button>
        </div>
      </section>
    </div>
  );
}
