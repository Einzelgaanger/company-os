import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { t } from "@/lib/copy";
import type { DailySurveyCycle } from "@/lib/types";

/**
 * Today's five questions for whichever project or department this person works
 * in. Every question is open text by design — the daily survey exists to
 * surface working conditions in people's own words, not to score them.
 */
export default function SurveyCurrent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<DailySurveyCycle | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const c = await db.getMyLiveSurvey(user.id);
        if (cancelled) return;
        setCycle(c ?? null);
        if (c) setAlready(await db.hasRespondedToSurvey(c.id, user.id));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;
  if (loading) return <TableSkeleton />;

  const questions = cycle?.questions ?? [];
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycle || !user) return;
    setBusy(true);
    try {
      const written = await db.submitDailySurvey(cycle.id, answers, user.id);
      toast(
        written > 0
          ? "Thanks. Your answers are anonymous from here on."
          : "Nothing submitted — every question was left blank.",
        written > 0 ? "success" : "error",
      );
      if (written > 0) navigate("/flow");
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!cycle) {
    return (
      <div className="portal-page space-y-3">
        <PageHeader
          title="Today's questions"
          description="Nothing to answer right now. Questions arrive each morning for the project or team you're working in."
        />
        <Link to="/flow" className="text-sm font-semibold underline">
          Back to Flow
        </Link>
      </div>
    );
  }

  if (already) {
    return (
      <div className="portal-page space-y-4">
        <PageHeader
          title="Answered for today"
          description={`You've already answered today's questions for ${cycle.scope_label}. The next set arrives tomorrow morning.`}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/flow")}>
            Back to Flow
          </Button>
          <Button asChild variant="outline">
            <Link to="/surveys/mine">See what I've answered</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page animate-fade-in space-y-4">
      <PageHeader
        title="Today's questions"
        description={`Five questions about working on ${cycle.scope_label}. Answer in your own words — short is fine.`}
      />

      <div className="flex items-start gap-3 border border-[rgba(14,31,26,0.12)] bg-[rgba(14,31,26,0.02)] p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate" />
        <div className="space-y-1 text-sm text-slate">
          <p className="font-semibold text-ink">Your manager will never see your answers.</p>
          <p>
            Answers are stored without any link back to you. Managers get a weekly summary of
            recurring themes, and only when at least five people in the same group have
            answered. If fewer answer, nothing is reported at all.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="border border-[rgba(14,31,26,0.12)] bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <label htmlFor={q.id} className="text-sm font-semibold text-ink">
                {i + 1}. {q.question_text}
              </label>
              <Badge variant="outline" className="shrink-0">
                {q.topic}
              </Badge>
            </div>
            <Textarea
              id={q.id}
              rows={3}
              placeholder="In your own words…"
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              className="input-glass"
            />
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="btn-primary" disabled={busy || answered === 0}>
            {busy ? "Submitting…" : "Submit answers"}
          </Button>
          <p className="text-[11px] text-slate">
            {answered} of {questions.length} answered. Skip anything you'd rather not answer —
            blanks are not recorded.
          </p>
        </div>
      </form>
    </div>
  );
}
