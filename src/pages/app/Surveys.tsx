import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, TableSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { api, apiConfigured } from "@/lib/api";
import { db } from "@/lib/db";
import { t } from "@/lib/copy";
import { MIN_SURVEY_N } from "@/lib/surveyConstants";
import { roleAtLeast } from "@/lib/types";

type Cycle = {
  id: string;
  title: string;
  closedAt: string | null;
  responseCount: number;
  themes: Array<{ tag: string; count: number }> | null;
  suppressed: boolean;
  message?: string;
  status?: string;
};

/** Phase 5 — aggregate themes only; never per-user sentiment (C-2). */
export default function Surveys() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const isAdmin = user ? roleAtLeast(user.role, "admin") : false;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (apiConfigured()) {
        try {
          const res = await api.listSurveys();
          if (!cancelled) {
            setCycles(res.items as Cycle[]);
            setSource("api");
            setLoading(false);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      const local = await db.listSurveyCycles(user.org_id);
      if (!cancelled) {
        setCycles(
          local.map((c) => ({
            id: c.id,
            title: c.title,
            closedAt: c.closes_at,
            responseCount: c.response_count,
            themes: c.response_count >= MIN_SURVEY_N ? [{ tag: "clarity", count: 3 }] : null,
            suppressed: c.response_count < MIN_SURVEY_N,
            message: c.response_count < MIN_SURVEY_N ? t("C-SURVEY-SUPPRESSED") : undefined,
            status: c.status,
          })),
        );
        setSource("mock");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return <TableSkeleton />;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Surveys"
        description="Anonymous theme summaries only when at least 5 people respond. Loop never shows individual sentiment."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/surveys/current">Current survey</Link>
          </Button>
        }
      />
      <p className="mb-3 text-[11px] text-slate">Source: {source === "api" ? "API" : "mock store"}</p>

      {cycles.length === 0 ? (
        <EmptyState title="No survey cycles yet" description="Admins configure cycles under report settings." />
      ) : (
        <ul className="space-y-4">
          {cycles.map((c) => (
            <li key={c.id} className="border border-[rgba(14,31,26,0.12)] bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">{c.title}</h2>
                <Badge variant="outline">n={c.responseCount}</Badge>
                {c.status ? <Badge variant="outline">{c.status}</Badge> : null}
                {c.suppressed && <Badge variant="outline">suppressed</Badge>}
              </div>
              {c.suppressed ? (
                <p className="text-sm text-slate">{c.message}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(c.themes ?? []).map((th) => (
                    <li key={th.tag} className="flex justify-between gap-4">
                      <span className="text-ink">{th.tag}</span>
                      <span className="font-mono text-xs tabular-nums text-slate">{th.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {isAdmin && c.status === "pending_review" ? (
                <Button asChild size="sm" className="mt-3 btn-primary">
                  <Link to={`/surveys/${c.id}/review`}>Review questions</Link>
                </Button>
              ) : null}
              <p className="mt-3 text-[11px] text-slate">
                C-2: no user-keyed sentiment. Individual answers are purged after aggregation.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
