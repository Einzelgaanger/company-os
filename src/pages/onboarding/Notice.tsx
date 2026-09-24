import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { db } from "@/lib/db";
import { NOTICE_VERSION } from "@/lib/legalRecords";

/**
 * C-3 individual transparency notice — blocking before any processing.
 * The acknowledgement is written to `users.notice_acknowledged_at`.
 */
export default function OnbNotice() {
  const { user, org, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const retentionMsg = 12;
  const retentionTx = 12;

  async function continueNext() {
    if (!user || !ack) return;
    setBusy(true);
    try {
      if (apiConfigured()) {
        await api.ackNotice(NOTICE_VERSION);
      } else if (user) {
        await db.updateUser(user.id, {
          notification_prefs: {
            ...user.notification_prefs,
            notice_acknowledged_at: new Date().toISOString(),
            notice_acknowledged_version: NOTICE_VERSION,
          },
        });
        await refresh();
      }
      navigate("/onboarding/coordination");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not record the acknowledgement.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout
      step={0}
      steps={["Notice", "Profile", "Connections"]}
      title="What Company OS does with your work data"
      description={`${org?.name ?? "Your organization"} uses Company OS for work coordination — not performance evaluation.`}
    >
      <div className="space-y-3 text-sm font-medium leading-relaxed text-[#0E1F1A]">
        <p>
          Company OS helps your team keep track of who&apos;s working on what, so nobody has to chase status manually.
        </p>
        <p>
          <strong>What Company OS reads:</strong> meeting transcripts you&apos;re part of, your work calendar, and the
          connected work tools your organization has enabled. It does not read your personal accounts, your screen, your
          keystrokes, or anything your organization has excluded.
        </p>
        <p>
          <strong>What Company OS asks you:</strong> short Telegram messages about how your work is going and what&apos;s
          blocking you. You choose whether to receive these, and you can turn them off at any time.
        </p>
        <p>
          <strong>What your managers see:</strong> the status of work items — what&apos;s done, what&apos;s late,
          what&apos;s blocked. They do not see a score, rating, or ranking of you. Company OS does not produce one.
        </p>
        <p>
          <strong>What leadership sees:</strong> project progress and, where at least 5 people have responded, anonymous
          summaries of common themes. Individual survey answers are never shown to anyone.
        </p>
        <p>
          <strong>How long it&apos;s kept:</strong> {retentionMsg} months for messages, {retentionTx} months for
          transcripts.
        </p>
        <p>
          <strong>Your rights:</strong> see everything Company OS holds about you anytime, and request correction or deletion,
          from <strong>Settings → My data</strong>.
        </p>
        <label className="flex items-start gap-3 pt-2">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} />
          <span>I&apos;ve read this.</span>
        </label>
        <Button
          className="btn-primary mt-2"
          disabled={!ack || busy}
          onClick={() => void continueNext()}
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
