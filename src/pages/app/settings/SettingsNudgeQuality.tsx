import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { db } from "@/lib/db";

type Trigger = {
  id: string;
  name: string;
  precision: number | null;
  suspended: boolean;
  sends7d: number;
};

/** B5 — `/settings/nudge-quality` (§5.x / 08_PAGES). */
export default function SettingsNudgeQuality() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [threshold, setThreshold] = useState(0.7);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      if (apiConfigured()) {
        const res = await api.nudgeQuality();
        setNote(res.note);
        setThreshold(res.autoSuspendThreshold);
        setTriggers(res.triggers);
        return;
      }
      if (!user) return;
      const res = await db.getNudgeQuality(user.org_id);
      setNote(res.note);
      setThreshold(res.autoSuspendThreshold);
      setTriggers(res.triggers);
    } catch {
      toast("Could not load nudge quality.", "error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.org_id]);

  async function suspend(id: string) {
    setBusy(id);
    try {
      if (apiConfigured()) await api.suspendNudge(id);
      else await db.setNudgeSuspended(id, true);
      await load();
      toast("Trigger suspended.", "success");
    } catch {
      toast("Could not suspend.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function resume(id: string) {
    setBusy(id);
    try {
      if (apiConfigured()) await api.resumeNudge(id);
      else await db.setNudgeSuspended(id, false);
      await load();
      toast("Trigger resumed.", "success");
    } catch {
      toast("Could not resume.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Nudge quality"
        subtitle="Precision by trigger kind — auto-suspend below the threshold once measured."
      />
      <div className="portal-callout">{note || "Precision appears after YES/NO nudge_feedback."}</div>
      <p className="text-sm text-slate">
        Auto-suspend threshold:{" "}
        <span className="font-mono font-medium text-ink">{threshold.toFixed(2)}</span>
      </p>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Triggers</h2>
            <p className="portal-section__desc">{triggers.length} configured</p>
          </div>
        </header>
        {triggers.length === 0 ? (
          <p className="portal-section__body--pad text-sm text-slate">No triggers loaded.</p>
        ) : (
          <div className="divide-y divide-[rgba(14,31,26,0.06)]">
            {triggers.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-ink">{t.name}</div>
                  <div className="font-mono text-xs text-slate">
                    {t.id} · precision{" "}
                    {t.precision == null ? "—" : t.precision.toFixed(2)} · {t.sends7d} sends / 7d
                    {t.suspended ? " · suspended" : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  {t.suspended ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === t.id}
                      onClick={() => void resume(t.id)}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === t.id}
                      onClick={() => void suspend(t.id)}
                    >
                      Suspend
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
