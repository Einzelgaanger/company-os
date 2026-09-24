import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { format, parseISO } from "date-fns";
import type { DailySurveyCycle, DailySurveyQuestion } from "@/lib/types";

/**
 * Admin review of the questions the generator wrote for one cycle. Cycles
 * auto-publish at the daily cadence; this page exists for orgs that turn that
 * off, and so someone can always see why a topic was chosen.
 */
export default function SurveyReview() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<DailySurveyCycle | null>(null);
  const [questions, setQuestions] = useState<DailySurveyQuestion[]>([]);

  const load = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      const [cycles, qs] = await Promise.all([
        db.listDailySurveyCycles(user.org_id, 60),
        db.getSurveyCycleQuestions(id),
      ]);
      setCycle(cycles.find((c) => c.id === id) ?? null);
      setQuestions(qs);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;
  if (loading) return <TableSkeleton />;

  if (!cycle) {
    return (
      <div className="portal-page">
        <PageHeader title="Survey review" description="That cycle no longer exists." />
        <Link to="/surveys" className="text-sm font-semibold underline">
          Back to results
        </Link>
      </div>
    );
  }

  async function setApproval(questionId: string, approved: boolean) {
    await db.reviewDailySurveyQuestion(questionId, approved, user!.id);
    setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, approved } : q)));
  }

  async function publish() {
    if (questions.some((q) => q.approved === null)) {
      toast("Approve or reject every question first.", "error");
      return;
    }
    if (questions.every((q) => q.approved === false)) {
      toast("Every question was rejected — there is nothing to send.", "error");
      return;
    }
    await db.publishDailySurveyCycle(cycle!.id);
    toast("Published. It goes out at each person's local send hour.", "success");
    navigate("/surveys");
  }

  const approved = questions.filter((q) => q.approved === true).length;
  const pending = questions.filter((q) => q.approved === null).length;

  return (
    <div className="portal-page animate-fade-in space-y-4">
      <PageHeader
        title={`${cycle.scope_label} · ${format(parseISO(cycle.survey_date), "EEE d MMM")}`}
        description="Questions are written fresh each day from what the system can see. Review them before they go out."
      />

      {cycle.generation_rationale ? (
        <div className="border border-[rgba(14,31,26,0.12)] bg-[rgba(14,31,26,0.02)] p-4">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-slate">
            Why these topics today
          </p>
          <p className="text-sm text-ink">{cycle.generation_rationale}</p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={q.id} className="border border-[rgba(14,31,26,0.12)] bg-white p-4">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {q.sort_order}. {q.question_text}
              </p>
              <div className="flex shrink-0 gap-2">
                <Badge variant="outline">{q.topic}</Badge>
                <Badge
                  variant={q.approved === true ? "green" : q.approved === false ? "red" : "amber"}
                >
                  {q.approved === true ? "approved" : q.approved === false ? "rejected" : "pending"}
                </Badge>
              </div>
            </div>

            {q.probe_reason ? (
              <p className="mb-3 text-[12px] text-slate">Chosen because: {q.probe_reason}</p>
            ) : null}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={q.approved === true ? "default" : "outline"}
                onClick={() => void setApproval(q.id, true)}
              >
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant={q.approved === false ? "default" : "outline"}
                onClick={() => void setApproval(q.id, false)}
              >
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="btn-primary" onClick={() => void publish()} disabled={pending > 0}>
          Publish {approved} question{approved === 1 ? "" : "s"}
        </Button>
        {pending > 0 ? (
          <p className="text-[11px] text-slate">
            {pending} still need{pending === 1 ? "s" : ""} a decision.
          </p>
        ) : null}
      </div>
    </div>
  );
}
