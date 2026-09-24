import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { MIN_SURVEY_N } from "@/lib/surveyConstants";
import { roleAtLeast, type DailySurveyCycle, type SurveyAggregate } from "@/lib/types";
import { format, parseISO } from "date-fns";

function weekLabel(a: SurveyAggregate): string {
  return `${format(parseISO(a.period_start), "MMM d")} – ${format(parseISO(a.period_end), "MMM d")}`;
}

/**
 * Weekly results. Everything on this page is an aggregate of at least
 * MIN_SURVEY_N people — the database enforces that floor, so there is no code
 * path here that could render one person's answer.
 */
function SentimentBar({ a }: { a: SurveyAggregate }) {
  const pos = a.sentiment_positive_pct;
  const neu = a.sentiment_neutral_pct;
  const neg = a.sentiment_negative_pct;
  if (pos == null || neu == null || neg == null) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] text-slate">
        <span className="font-mono uppercase tracking-wide">Tone of answers</span>
        <span className="font-mono tabular-nums">
          {pos}% positive · {neu}% neutral · {neg}% negative
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-soft">
        <div className="bg-mint" style={{ width: `${pos}%` }} title={`${pos}% positive`} />
        <div className="bg-[rgba(14,31,26,0.12)]" style={{ width: `${neu}%` }} title={`${neu}% neutral`} />
        <div className="bg-gold-wash" style={{ width: `${neg}%` }} title={`${neg}% negative`} />
      </div>
    </div>
  );
}

function ThemeRow({ theme, max }: { theme: SurveyAggregate["themes"][number]; max: number }) {
  const width = max > 0 ? Math.round((theme.mentionCount / max) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-ink">{theme.theme}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate">
          {theme.mentionCount} mention{theme.mentionCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-soft">
        <div className="h-1.5 rounded-full bg-forest/60" style={{ width: `${width}%` }} />
      </div>
      {theme.exampleParaphrase ? (
        <p className="text-[12px] italic text-slate">{theme.exampleParaphrase}</p>
      ) : null}
    </li>
  );
}

function AggregateCard({ a }: { a: SurveyAggregate }) {
  const max = Math.max(...a.themes.map((t) => t.mentionCount), 1);
  const coverage =
    a.invited_count > 0 ? Math.round((a.respondent_count / a.invited_count) * 100) : null;

  return (
    <article className="border border-[rgba(14,31,26,0.12)] bg-white p-5">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{a.scope_label}</h3>
        <Badge variant={a.scope_type === "org" ? "teal" : "outline"}>
          {a.scope_type === "manager_line" ? "your line" : a.scope_type}
        </Badge>
        <span className="font-mono text-xs text-slate">{weekLabel(a)}</span>
      </header>

      <dl className="mb-4 grid grid-cols-3 gap-4 border-y border-[rgba(14,31,26,0.08)] py-3">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wide text-slate">People</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{a.respondent_count}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wide text-slate">Answers</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{a.response_count}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-wide text-slate">Took part</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">
            {coverage == null ? "—" : `${coverage}%`}
          </dd>
        </div>
      </dl>

      <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-slate">
        What came up repeatedly
      </h4>
      {a.themes.length === 0 ? (
        <p className="text-sm text-slate">No theme recurred often enough to report.</p>
      ) : (
        <ul className="space-y-3">
          {a.themes.map((th) => (
            <ThemeRow key={th.theme} theme={th} max={max} />
          ))}
        </ul>
      )}

      {a.questions_asked.length > 0 ? (
        <details className="mt-4 border-t border-[rgba(14,31,26,0.08)] pt-3">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-slate">
            Questions asked this week ({a.questions_asked.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {a.questions_asked.map((q) => (
              <li key={q.question} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-ink">{q.question}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-slate">
                  {q.topic} · {q.answers}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-4">
        <SentimentBar a={a} />
      </div>
    </article>
  );
}

export default function Surveys() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [aggregates, setAggregates] = useState<SurveyAggregate[]>([]);
  const [cycles, setCycles] = useState<DailySurveyCycle[]>([]);

  const isAdmin = user ? roleAtLeast(user.role, "admin") : false;

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const [aggs, cyc] = await Promise.all([
        db.listSurveyAggregates(user.org_id),
        isAdmin ? db.listDailySurveyCycles(user.org_id, 14) : Promise.resolve([]),
      ]);
      setAggregates(aggs);
      setCycles(cyc);
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

  // Newest week first, and within a week the broadest scope first so a manager
  // reads the company picture before drilling into one project.
  const weeks = useMemo(() => {
    const order = { org: 0, manager_line: 1, department: 2, project: 3 } as const;
    const map = new Map<string, SurveyAggregate[]>();
    for (const a of aggregates) {
      map.set(a.period_end, [...(map.get(a.period_end) ?? []), a]);
    }
    return [...map.entries()]
      .sort((x, y) => y[0].localeCompare(x[0]))
      .map(
        ([end, items]) =>
          [end, items.sort((p, q) => order[p.scope_type] - order[q.scope_type])] as const,
      );
  }, [aggregates]);

  const awaitingReview = cycles.filter((c) => c.status === "pending_review");

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Survey results"
        description="Five open questions a day, written for each project and team. This page shows what came back, grouped into themes."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/surveys/current">Answer today's questions</Link>
          </Button>
        }
      />

      <div className="mb-6 flex items-start gap-3 border border-[rgba(14,31,26,0.12)] bg-[rgba(14,31,26,0.02)] p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate" />
        <p className="text-sm text-slate">
          Nothing here can be traced to a person. A group is only reported once{" "}
          <strong className="font-semibold text-ink">{MIN_SURVEY_N} or more people</strong> have
          answered; below that the group is folded into its parent or left out entirely. Company OS
          does not produce individual sentiment scores.
        </p>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : (
        <div className="space-y-8">
          {isAdmin && awaitingReview.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-mono text-xs uppercase tracking-wide text-slate">
                Awaiting your review
              </h2>
              {awaitingReview.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-[rgba(14,31,26,0.12)] bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {c.scope_label} · {format(parseISO(c.survey_date), "EEE d MMM")}
                    </p>
                    {c.theme ? <p className="text-sm text-slate">{c.theme}</p> : null}
                  </div>
                  <Button asChild size="sm" className="btn-primary">
                    <Link to={`/surveys/${c.id}/review`}>Review questions</Link>
                  </Button>
                </div>
              ))}
            </section>
          ) : null}

          {weeks.length === 0 ? (
            <EmptyState
              title="No results yet"
              description={`The first weekly summary appears once at least ${MIN_SURVEY_N} people in a group have answered. Summaries are produced every Monday morning.`}
            />
          ) : (
            weeks.map(([end, items]) => (
              <section key={end} className="space-y-3">
                <h2 className="font-mono text-xs uppercase tracking-wide text-slate">
                  Week ending {format(parseISO(end), "d MMM yyyy")}
                </h2>
                <div className="space-y-4">
                  {items.map((a) => (
                    <AggregateCard key={a.id} a={a} />
                  ))}
                </div>
              </section>
            ))
          )}

          <p className="flex items-center gap-2 text-[11px] text-slate">
            <Lock className="h-3 w-3" />
            Individual answers are deleted once a week is summarised, along with the key that
            grouped them.
          </p>
        </div>
      )}
    </div>
  );
}
