import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { LoopMotif } from "@/components/LoopMotif";
import {
  CostOfDelayBadge,
  ScopeSwitcher,
  StatusChip,
  WaitingBars,
  WaitingDuration,
} from "@/components/flow";
import { useAuth } from "@/context/AuthContext";
import { allowedScopesFor, defaultScopeFor, fetchWaiting } from "@/lib/flowData";
import {
  COST_OF_DELAY_WEIGHT,
  WAITING_KINDS,
  WAITING_KIND_LABEL,
  formatTeamDays,
  type FlowScope,
  type WaitingKind,
  type WaitingResponse,
  type WaitingRow,
} from "@/lib/flow";
import { cn } from "@/lib/utils";

/**
 * /waiting — the waiting register (08_PAGES §8.5).
 *
 * The screen a manager opens instead of chasing. Every item currently waiting,
 * ordered by cost of delay × age, and who holds it.
 *
 * Grouping, sorting and filtering happen on the response the register already
 * carries rather than by refetching: the payload includes both groupings, so a
 * regroup is instant and the totals never disagree with the rows.
 *
 * Nudge, escalate, reassign and export land with the nudge engine. Until the
 * send path exists a "Nudge" button would be a promise the app cannot keep.
 */

type Group = "holder" | "project";
type Sort = "cost" | "age" | "project";

const SORT_LABEL: Record<Sort, string> = {
  cost: "Cost × age",
  age: "Age",
  project: "Project",
};

function isScope(v: string | null): v is FlowScope {
  return v === "self" || v === "team" || v === "org";
}

/** Holder keys can be external names with spaces; DOM ids cannot. */
function anchorId(key: string): string {
  return `waiting-group-${key.replace(/[^\w-]+/g, "-")}`;
}

export default function Waiting() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const allowedScopes = useMemo(
    () => (user ? allowedScopesFor(user.role) : (["self"] as FlowScope[])),
    [user],
  );

  const urlScope = params.get("scope");
  const scope: FlowScope =
    isScope(urlScope) && allowedScopes.includes(urlScope)
      ? urlScope
      : user
        ? defaultScopeFor(user.role)
        : "self";
  const group: Group = params.get("group") === "project" ? "project" : "holder";
  const sortParam = params.get("sort");
  const sort: Sort = sortParam === "age" || sortParam === "project" ? sortParam : "cost";
  const types = useMemo(() => {
    const raw = params.get("types");
    if (!raw) return [] as WaitingKind[];
    return raw.split(",").filter((k): k is WaitingKind => WAITING_KINDS.includes(k as WaitingKind));
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [register, setRegister] = useState<WaitingResponse | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      setRegister(await fetchWaiting(user, scope));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) p.delete(key);
      else p.set(key, value);
    }
    setParams(p, { replace: true });
  }

  function toggleType(kind: WaitingKind) {
    const next = types.includes(kind) ? types.filter((k) => k !== kind) : [...types, kind];
    patch({ types: next.length ? next.join(",") : null });
  }

  const rows = useMemo(() => {
    if (!register) return [] as WaitingRow[];
    const filtered = types.length
      ? register.items.filter((r) => types.includes(r.waitingKind))
      : register.items;
    const sorted = [...filtered];
    if (sort === "age") sorted.sort((a, b) => b.workingSeconds - a.workingSeconds);
    else if (sort === "project")
      sorted.sort(
        (a, b) =>
          (a.projectName ?? "zzz").localeCompare(b.projectName ?? "zzz") ||
          b.costScore - a.costScore,
      );
    else sorted.sort((a, b) => b.costScore - a.costScore);
    return sorted;
  }, [register, types, sort]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: WaitingRow[] }>();
    for (const row of rows) {
      const key = group === "holder" ? row.holderKey : (row.projectId ?? "none");
      const label = group === "holder" ? row.holderLabel : (row.projectName ?? "No project");
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { key, label, rows: [] };
        map.set(key, bucket);
      }
      bucket.rows.push(row);
    }
    return [...map.values()]
      .map((bucket) => ({
        ...bucket,
        workingDays: Math.round(bucket.rows.reduce((sum, r) => sum + r.workingDays, 0) * 10) / 10,
        costScore: bucket.rows.reduce((sum, r) => sum + r.costScore, 0),
      }))
      .sort((a, b) =>
        sort === "age" || sort === "cost"
          ? b.workingDays - a.workingDays
          : a.label.localeCompare(b.label),
      );
  }, [rows, group, sort]);

  const shownTeamDays = useMemo(
    () => Math.round(rows.reduce((sum, r) => sum + r.workingDays, 0) * 10) / 10,
    [rows],
  );

  if (!user) return null;

  if (loading) {
    return (
      <div className="portal-page animate-fade-in">
        <PageHeader title="Waiting" description="Every item that is waiting, and who holds it." />
        <div className="portal-section h-40 animate-pulse" />
        <div className="portal-section h-64 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-page animate-fade-in">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (!register || register.totals.itemCount === 0) {
    return (
      <div className="portal-page animate-fade-in">
        <PageHeader title="Waiting" description="Every item that is waiting, and who holds it." />
        <EmptyState
          illustration={<LoopMotif size={160} />}
          title="Nothing is waiting. That's the goal."
          description="Items appear here the moment something stalls on a person, a decision or an outside party."
        />
      </div>
    );
  }

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Waiting"
        description={`${register.totals.itemCount} ${register.totals.itemCount === 1 ? "item" : "items"} waiting · ${formatTeamDays(register.totals.teamDays)} of held-up time.`}
        actions={
          <ScopeSwitcher
            scope={scope}
            allowed={allowedScopes}
            onChange={(next) => patch({ scope: next })}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-2.5">
        <Segmented
          label="Group"
          options={[
            { value: "holder", label: "By holder" },
            { value: "project", label: "By project" },
          ]}
          value={group}
          onChange={(v) => patch({ group: v })}
        />

        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5A6B7D]">
          Sort
          <select
            value={sort}
            onChange={(e) => patch({ sort: e.target.value })}
            className="rounded-md border border-[rgba(14,31,26,0.12)] bg-white px-2 py-1 text-[11px] font-semibold text-[#0E1F1A]"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-semibold text-[#5A6B7D]">Type</span>
          {WAITING_KINDS.map((kind) => {
            const on = types.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(kind)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
                  on
                    ? "border-[#0E1F1A] bg-[#0E1F1A] text-white"
                    : "border-[rgba(14,31,26,0.12)] bg-white text-[#5A6B7D] hover:bg-[#F7FAF6]",
                )}
              >
                {WAITING_KIND_LABEL[kind]}
              </button>
            );
          })}
          {types.length > 0 && (
            <button
              type="button"
              onClick={() => patch({ types: null })}
              className="px-1 text-[11px] font-semibold text-[#5A6B7D] underline"
            >
              Clear
            </button>
          )}
        </div>

        {types.length > 0 && (
          <span className="ml-auto font-mono text-[11px] text-[#5A6B7D]">
            {rows.length} of {register.totals.itemCount} shown · {shownTeamDays.toFixed(1)}d
          </span>
        )}
      </div>

      {group === "holder" && groups.length > 1 && (
        <section className="portal-section">
          <header className="portal-section__head">
            <div>
              <h2 className="portal-section__title">Waiting days by holder</h2>
              <p className="portal-section__desc">
                Total working days held, highest first. Click a bar to jump to the group.
              </p>
            </div>
          </header>
          <div className="portal-section__body--pad">
            <WaitingBars
              groups={groups.map((g) => ({
                key: g.key,
                label: g.label,
                itemCount: g.rows.length,
                workingDays: g.workingDays,
                itemIds: g.rows.map((r) => r.id),
              }))}
              onSelect={(key) => {
                document
                  .getElementById(anchorId(key))
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="portal-section px-3 py-8 text-center text-[11px] font-medium text-[#5A6B7D]">
          No waiting items of that type. {register.totals.itemCount} are waiting for other reasons.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((bucket) => {
            const open = !collapsed.has(bucket.key);
            return (
              <section
                key={bucket.key}
                id={anchorId(bucket.key)}
                className="portal-section scroll-mt-4"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(bucket.key)) next.delete(bucket.key);
                      else next.add(bucket.key);
                      return next;
                    })
                  }
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#5A6B7D]" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#5A6B7D]" />
                    )}
                    <span className="truncate text-sm font-bold text-forest">{bucket.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[#5A6B7D]">
                    {bucket.rows.length} {bucket.rows.length === 1 ? "item" : "items"} ·{" "}
                    {bucket.workingDays.toFixed(1)} working days
                  </span>
                </button>

                {open && (
                  <div className="divide-y divide-[rgba(14,31,26,0.06)] border-t border-[rgba(14,31,26,0.06)]">
                    {bucket.rows.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/commitments/${row.id}`}
                            className="block truncate text-sm font-medium text-forest hover:underline"
                          >
                            {row.title}
                          </Link>
                          <div className="text-[11px] font-medium text-[#5A6B7D]">
                            {group === "holder"
                              ? (row.projectName ?? "No project")
                              : `on ${row.holderLabel}`}
                            {" · "}
                            <span className="font-mono">
                              cost weight ×{COST_OF_DELAY_WEIGHT[row.costOfDelayBand]}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <CostOfDelayBadge band={row.costOfDelayBand} />
                          <StatusChip
                            state={row.flowState}
                            attention={row.needsLook || row.workingDays >= 7}
                          />
                          <WaitingDuration workingDays={row.workingDays} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#5A6B7D] transition-colors",
            value === option.value ? "bg-[#0E1F1A] text-white" : "hover:bg-[#F7FAF6]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
