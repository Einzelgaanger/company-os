import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { SurveyCycle } from "@/lib/types";

/** Admin approve/reject generated survey questions. */
export default function SurveyReview() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<SurveyCycle | null>(null);

  async function load() {
    if (!id) return;
    const c = await db.getSurveyCycle(id);
    setCycle(c ?? null);
  }

  useEffect(() => {
    void load();
  }, [id]);

  if (!user) return null;
  if (!cycle) {
    return (
      <div className="portal-page">
        <PageHeader title="Survey review" description="Cycle not found." />
        <Link to="/surveys" className="underline">
          Back
        </Link>
      </div>
    );
  }

  async function setApproval(questionId: string, approved: boolean) {
    const next = await db.reviewSurveyQuestion(cycle!.id, questionId, approved);
    setCycle(next);
    toast(approved ? "Question approved" : "Question rejected", "success");
  }

  async function publish() {
    const pending = cycle!.questions.some((q) => q.approved === null);
    if (pending) {
      toast("Approve or reject every question first.", "error");
      return;
    }
    const rejected = cycle!.questions.every((q) => q.approved === false);
    if (rejected) {
      toast("All questions rejected — nothing to publish.", "error");
      return;
    }
    await db.publishSurveyCycle(cycle!.id);
    toast("Survey published as live.", "success");
    navigate("/surveys");
  }

  return (
    <div className="portal-page animate-fade-in space-y-4">
      <PageHeader
        title={`Review: ${cycle.title}`}
        description="Approve or reject AI-generated questions before going live."
      />
      <ul className="space-y-3">
        {cycle.questions.map((q) => (
          <li key={q.id} className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4">
            <p className="mb-2 text-sm font-medium text-[#0E1F1A]">{q.text}</p>
            <p className="mb-3 text-[11px] text-[#5A6B7D]">
              {q.kind} ·{" "}
              {q.approved === true ? "approved" : q.approved === false ? "rejected" : "pending"}
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="btn-primary" onClick={() => void setApproval(q.id, true)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => void setApproval(q.id, false)}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button className="btn-primary" onClick={() => void publish()}>
        Publish survey
      </Button>
    </div>
  );
}
