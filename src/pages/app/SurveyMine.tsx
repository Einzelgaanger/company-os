import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { t } from "@/lib/copy";
import { format, parseISO } from "date-fns";
import type { MySurveyResponse } from "@/lib/types";

/**
 * What one person answered, read back to them. This is only possible while a
 * week is still open — once the weekly summary runs, the key that links
 * answers to people is destroyed and even this page can no longer find them.
 */
export default function SurveyMine() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState<MySurveyResponse[]>([]);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      setRows(await db.listMySurveyResponses(user.id));
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

  const byCycle = useMemo(() => {
    const map = new Map<string, MySurveyResponse[]>();
    for (const r of rows) map.set(r.cycle_id, [...(map.get(r.cycle_id) ?? []), r]);
    return [...map.values()].sort((a, b) => b[0].survey_date.localeCompare(a[0].survey_date));
  }, [rows]);

  async function withdraw(cycleId: string, label: string) {
    if (!user) return;
    if (!confirm(`Delete your answers for ${label}? This cannot be undone.`)) return;
    try {
      const removed = await db.deleteMySurveyResponses(cycleId, user.id);
      toast(`${removed} answer${removed === 1 ? "" : "s"} deleted.`, "success");
      await load();
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    }
  }

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in space-y-4">
      <PageHeader
        title="What I've answered"
        description="Your own survey answers, while they still exist. Nobody else can see this page."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/surveys/current">Today's questions</Link>
          </Button>
        }
      />

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : byCycle.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          description="Either you haven't answered recently, or the weeks you answered in have already been summarised and the link back to you was destroyed."
        />
      ) : (
        <div className="space-y-4">
          {byCycle.map((group) => (
            <section key={group[0].cycle_id} className="border border-[rgba(14,31,26,0.12)] bg-white p-5">
              <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{group[0].scope_label}</h2>
                  <p className="font-mono text-xs text-slate">
                    {format(parseISO(group[0].survey_date), "EEEE d MMMM yyyy")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void withdraw(group[0].cycle_id, group[0].scope_label)}
                >
                  <Trash2 className="h-4 w-4" /> Delete these answers
                </Button>
              </header>
              <dl className="space-y-3">
                {group.map((r, i) => (
                  <div key={`${r.cycle_id}-${i}`}>
                    <dt className="text-sm text-slate">{r.question_text}</dt>
                    <dd className="mt-0.5 text-sm text-ink">{r.answer_text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <p className="text-[11px] text-slate">
            Deleting removes your answers before they reach any summary. If a week has already
            been summarised, your answers are gone from here but the theme counts they
            contributed to remain, because those cannot be unpicked back to a person.
          </p>
        </div>
      )}
    </div>
  );
}
