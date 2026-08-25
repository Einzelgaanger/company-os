import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Hourglass, Minus, Unlock } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, StatCardsSkeleton } from "@/components/feedback/states";
import { LoopMotif } from "@/components/LoopMotif";
import {
  AgingScatter,
  CostOfDelayBadge,
  FlowSparkline,
  ScopeSwitcher,
  StatusChip,
  WaitingDuration,
} from "@/components/flow";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { t } from "@/lib/copy";
import {
  allowedScopesFor,
  defaultScopeFor,
  fetchFlowAging,
  fetchFlowSummary,
  fetchWaiting,
} from "@/lib/flowData";
import {
  formatTeamDays,
  formatWorkingDays,
  type AgingResponse,
  type FlowScope,
  type FlowSummaryResponse,
  type WaitingResponse,
} from "@/lib/flow";
import { timeAgo } from "@/lib/utils";
import { roleAtLeast, type Escalation } from "@/lib/types";

/**
 * /flow — the hero screen (08_PAGES §8.4).
 *
 * Replaces /dashboard and its four count cards. The question this screen answers
 * is not "how many items are open" but "how much of the organization's time is
 * sitting still, and where" (04_FLOW_ENGINE §4.9).
 *
 * Each panel loads and fails on its own: one dead endpoint dims one card, never
 * the page. The project fever grid (row 6) arrives with B6, and the row-level
 * nudge and escalate actions with the nudge engine — a button that cannot do
 * what it says is worse than an absent one, so neither is stubbed here.
 */

type Panel<T> = { data: T | null; error: boolean };

const IDLE = { data: null, error: false };

function isScope(value: string | null): value is FlowScope {
  return value === "self" || value === "team" || value === "org";
}

export default function Flow() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Panel<FlowSummaryResponse>>(IDLE);
  const [aging, setAging] = useState<Panel<AgingResponse>>(IDLE);
  const [waiting, setWaiting] = useState<Panel<WaitingResponse>>(IDLE);
  const [decisions, setDecisions] = useState<Panel<Escalation[]>>(IDLE);
  const [wipDismissed, setWipDismissed] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!user) return;
    setSummary(IDLE);
    try {
      setSummary({ data: await fetchFlowSummary(user, scope), error: false });
    } catch {
      setSummary({ data: null, error: true });
    }
  }, [user, scope]);

  const loadAging = useCallback(async () => {
    if (!user) return;
    setAging(IDLE);
    try {
      setAging({ data: await fetchFlowAging(user, scope), error: false });
    } catch {
      setAging({ data: null, error: true });
    }
  }, [user, scope]);

  const loadWaiting = useCallback(async () => {
    if (!user) return;
    setWaiting(IDLE);
    try {
      setWaiting({ data: await fetchWaiting(user, scope, { limit: 10 }), error: false });
    } catch {
      setWaiting({ data: null, error: true });
    }
  }, [user, scope]);

  const loadDecisions = useCallback(async () => {
    if (!user) return;
    setDecisions(IDLE);
    try {
      const all = await db.listEscalations(user.org_id);
      const mine = all.filter(
        (e) =>
          e.status !== "resolved" &&
          (roleAtLeast(user.role, "admin") || e.escalated_to_id === user.id),
      );
      setDecisions({ data: mine.slice(0, 5), error: false });
    } catch {
      setDecisions({ data: null, error: true });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    void Promise.all([loadSummary(), loadAging(), loadWaiting(), loadDecisions()]).finally(() =>
      setLoading(false),
    );
  }, [user, loadSummary, loadAging, loadWaiting, loadDecisions]);

  function setScope(next: FlowScope) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("scope", next);
    setParams(nextParams, { replace: true });
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="portal-page animate-fade-in">
        <PageHeader title="Flow" description="Where the organization's time is sitting still." />
        <StatCardsSkeleton />
        <div className="portal-section h-72 animate-pulse" />
        <div className="portal-section h-64 animate-pulse" />
      </div>
    );
  }

  const everyPanelFailed = summary.error && aging.error && waiting.error;
  if (everyPanelFailed) {
    return (
      <div className="portal-page animate-fade-in">
        <ErrorState
          onRetry={() => {
            void loadSummary();
            void loadAging();
            void loadWaiting();
            void loadDecisions();
          }}
        />
      </div>
    );
  }

  const s = summary.data;
  const nothingWaiting = s !== null && s.waitingNow.itemCount === 0;
  const nothingAtAll =
    nothingWaiting && s.wip.openCount === 0 && (aging.data?.sampleSize ?? 0) === 0;

  // §8.4 — a healthy org must not see a screen that looks broken, so an empty
  // register and an unconnected tenant get different copy.
  if (nothingAtAll) {
    return (
      <div className="portal-page animate-fade-in">
        <PageHeader title="Flow" description="Where the organization's time is sitting still." />
        <EmptyState
          illustration={<LoopMotif size={180} />}
          title="Nothing's waiting"
          description="Connect your meeting tool and Loop will start tracking what's owed."
          action={<Button onClick={() => navigate("/integrations")}>Connect your tools</Button>}
        />
      </div>
    );
  }

  const debtIcon =
    s?.flowDebt.direction === "up"
      ? ArrowUpRight
      : s?.flowDebt.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Flow"
        description="Where the organization's time is sitting still, and who holds it."
        actions={
          <ScopeSwitcher scope={scope} allowed={allowedScopes} onChange={setScope} />
        }
      />

      {summary.error ? (
        <PanelError label="Flow metrics" onRetry={loadSummary} />
      ) : (
        s && (
          <div className="portal-metrics">
            <StatCard
              label="Waiting now"
              value={formatTeamDays(s.waitingNow.teamDays)}
              detail={`${s.waitingNow.itemCount} ${s.waitingNow.itemCount === 1 ? "item" : "items"} held up`}
              icon={Hourglass}
              accent="waiting"
              onClick={() => navigate(`/waiting?scope=${scope}`)}
            />
            <StatCard
              label="Longest wait"
              value={
                s.longestWait ? formatWorkingDays(s.longestWait.workingDays) : "Nothing waiting"
              }
              detail={s.longestWait ? `on ${s.longestWait.holderLabel}` : undefined}
              icon={Clock}
              accent={s.longestWait && s.longestWait.workingDays >= 7 ? "attention" : "waiting"}
              onClick={() => navigate(`/waiting?scope=${scope}&sort=age`)}
            />
            <StatCard
              label="Flow debt trend"
              value={
                s.flowDebt.deltaDays === 0
                  ? "Level"
                  : `${s.flowDebt.deltaDays > 0 ? "▲" : "▼"} ${Math.abs(s.flowDebt.deltaDays).toFixed(1)} days`
              }
              detail="vs last week"
              chart={<FlowSparkline points={s.trend} />}
              icon={debtIcon}
              accent={s.flowDebt.direction === "up" ? "waiting" : "forest"}
              onClick={() => navigate("/reports")}
            />
            <StatCard
              label="Unblocked this week"
              value={s.unblockedThisWeek}
              detail="items that started moving again"
              icon={Unlock}
              accent="lime"
              onClick={() => navigate("/commitments?resolved=7d")}
            />
          </div>
        )
      )}

      {decisions.data && decisions.data.length > 0 && (
        <section className="portal-section">
          <header className="portal-section__head">
            <div>
              <h2 className="portal-section__title">Needs a human decision</h2>
              <p className="portal-section__desc">
                Routing is exhausted on these — they are waiting on a person, not a rule.
              </p>
            </div>
          </header>
          <div className="divide-y divide-[rgba(14,31,26,0.06)]">
            {decisions.data.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-forest">
                    {e.context_snapshot?.commitment?.title ?? e.reason}
                  </div>
                  <div className="text-[11px] font-medium text-[#5A6B7D]">
                    {e.reason} · raised {timeAgo(e.created_at)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/escalations`)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Aging work in progress</h2>
            <p className="portal-section__desc">
              Open items by time in queue and cost of delay
            </p>
          </div>
        </header>
        <div className="portal-section__body--pad">
          {aging.error ? (
            <PanelError label="Aging chart" onRetry={loadAging} />
          ) : !aging.data || aging.data.items.length === 0 ? (
            <p className="py-6 text-center text-[11px] font-medium text-[#5A6B7D]">
              No open items in this scope.
            </p>
          ) : (
            <AgingScatter
              items={aging.data.items}
              percentiles={aging.data.percentiles}
              sampleSize={aging.data.sampleSize}
              onSelect={(id) => navigate(`/commitments/${id}`)}
            />
          )}
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Waiting register</h2>
            <p className="portal-section__desc">Top items by cost of delay × age</p>
          </div>
          {waiting.data && waiting.data.totals.itemCount > waiting.data.items.length && (
            <Button size="sm" variant="ghost" onClick={() => navigate(`/waiting?scope=${scope}`)}>
              See all {waiting.data.totals.itemCount}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </header>
        {waiting.error ? (
          <div className="portal-section__body--pad">
            <PanelError label="Waiting register" onRetry={loadWaiting} />
          </div>
        ) : !waiting.data || waiting.data.items.length === 0 ? (
          <p className="px-3 py-8 text-center text-[11px] font-medium text-[#5A6B7D]">
            Nothing is waiting right now.
            {s ? ` ${s.unblockedThisWeek} items moved this week.` : ""}
          </p>
        ) : (
          <div className="divide-y divide-[rgba(14,31,26,0.06)]">
            {waiting.data.items.map((row) => (
              <button
                key={row.id}
                onClick={() => navigate(`/commitments/${row.id}`)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-soft"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-forest">{row.title}</div>
                  <div className="text-[11px] font-medium text-[#5A6B7D]">
                    on {row.holderLabel}
                    {row.projectName ? ` · ${row.projectName}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CostOfDelayBadge band={row.costOfDelayBand} />
                  <StatusChip state={row.flowState} />
                  <WaitingDuration workingDays={row.workingDays} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {s?.wip.exceeded && !wipDismissed && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-waiting bg-status-waiting-tint p-3 text-sm">
          <span className="font-medium text-status-waiting-ink">
            {s.wip.openCount} items are open against a limit of {s.wip.limit}. Starting more will
            slow all of them down.
          </span>
          {roleAtLeast(user.role, "admin") && (
            <Button size="sm" variant="ghost" onClick={() => setWipDismissed(true)}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PanelError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(14,31,26,0.1)] bg-[#F7FAF6] p-3 text-sm">
      <span className="font-medium text-[#5A6B7D]">
        {label} — {t("C-ERR-GENERIC")}
      </span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
