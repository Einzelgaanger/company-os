import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { db } from "@/lib/db";

type Rule = {
  id: string;
  type: string;
  value: string;
  scope: string;
  reason: string;
};

/** §4.5 / §8.9 — ingestion exclusions persist via API or mock store. */
export default function SettingsDataGovernance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [testInput, setTestInput] = useState("");
  const [scope, setScope] = useState<"user" | "meeting" | "keyword" | "domain">("keyword");
  const [matchValue, setMatchValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"api" | "mock">("mock");

  async function load() {
    try {
      if (apiConfigured()) {
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
        return;
      }
      if (!user) return;
      const items = await db.listExclusions(user.org_id);
      setSource("mock");
      setRules(
        items.map((r) => ({
          id: r.id,
          type: r.scope,
          value: r.match_value,
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
  }, [user?.org_id]);

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
    if (!matchValue.trim() || !user) return;
    setBusy(true);
    try {
      if (apiConfigured()) {
        await api.createExclusion({
          scope,
          matchValue: matchValue.trim(),
          reason: reason.trim() || undefined,
        });
      } else {
        await db.createExclusion(user.org_id, {
          scope,
          matchValue: matchValue.trim(),
          reason: reason.trim() || undefined,
        });
      }
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
    setBusy(true);
    try {
      if (apiConfigured()) await api.deleteExclusion(id);
      else await db.deleteExclusion(id);
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
        {source === "api"
          ? " Rules are stored in ingestion_exclusions."
          : " Rules are stored in the local demo store."}
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void removeRule(r.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Add exclusion</h2>
            <p className="portal-section__desc">Keyword, meeting title, domain, or user id</p>
          </div>
        </header>
        <div className="portal-section__body--pad flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <select
            className="h-9 rounded-md border border-[rgba(14,31,26,0.15)] bg-white px-2 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="keyword">keyword</option>
            <option value="meeting">meeting</option>
            <option value="domain">domain</option>
            <option value="user">user</option>
          </select>
          <Input
            className="max-w-xs"
            placeholder="Match value"
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
          />
          <Input
            className="max-w-xs"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="button" disabled={busy} onClick={() => void addRule()}>
            Add
          </Button>
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Test a string</h2>
            <p className="portal-section__desc">See whether content would be excluded</p>
          </div>
        </header>
        <div className="portal-section__body--pad flex flex-wrap gap-2">
          <Input
            className="max-w-md"
            placeholder="Sample title or body…"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
          />
          <Button type="button" variant="outline" onClick={testRule}>
            Test
          </Button>
        </div>
      </section>
    </div>
  );
}
