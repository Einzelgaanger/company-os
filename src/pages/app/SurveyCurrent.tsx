import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { uuid } from "@/lib/utils";
import type { SurveyCycle } from "@/lib/types";
import { t } from "@/lib/copy";

export default function SurveyCurrent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<SurveyCycle | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const c = await db.getCurrentSurvey(user.org_id);
      setCycle(c ?? null);
      if (c) setAlready(await db.hasSurveyAnswer(c.id, user.id));
    })();
  }, [user]);

  if (!user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycle || !user) return;
    setBusy(true);
    try {
      await db.submitSurveyAnswer({
        id: uuid(),
        org_id: user.org_id,
        cycle_id: cycle.id,
        user_id: user.id,
        answers: Object.fromEntries(
          Object.entries(answers).map(([k, v]) => [k, Number.isFinite(Number(v)) ? Number(v) : v]),
        ),
        submitted_at: new Date().toISOString(),
      });
      toast("Thanks — your answers are private.", "success");
      navigate("/flow");
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!cycle) {
    return (
      <div className="portal-page">
        <PageHeader title="Current survey" description="No live survey right now." />
        <Link to="/flow" className="text-sm font-semibold underline">
          Back to Flow
        </Link>
      </div>
    );
  }

  if (already) {
    return (
      <div className="portal-page space-y-3">
        <PageHeader title={cycle.title} description="You already submitted this cycle." />
        <Button variant="outline" onClick={() => navigate("/flow")}>
          Back to Flow
        </Button>
      </div>
    );
  }

  return (
    <div className="portal-page animate-fade-in space-y-4">
      <PageHeader title={cycle.title} description="Your individual answers are never shown to managers." />
      <form onSubmit={submit} className="space-y-4">
        {cycle.questions
          .filter((q) => q.approved !== false)
          .map((q) => (
            <div key={q.id} className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4">
              <label className="mb-2 block text-sm font-semibold text-[#0E1F1A]">{q.text}</label>
              {q.kind === "scale" ? (
                <Input
                  type="number"
                  min={1}
                  max={5}
                  required
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="input-glass max-w-[8rem]"
                />
              ) : (
                <Input
                  required
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="input-glass"
                />
              )}
            </div>
          ))}
        <Button type="submit" className="btn-primary" disabled={busy}>
          Submit answers
        </Button>
      </form>
    </div>
  );
}
