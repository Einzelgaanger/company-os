import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  COORDINATION_COPY,
  COORDINATION_MODES,
  DEFAULT_COORDINATION_MODE,
  coordinationCopy,
  isCoordinationMode,
  type CoordinationMode,
} from "@/lib/coordination";

/**
 * B4 — 03_COORDINATION_MODES.md §3.6. Changeable later, with a warning that it
 * changes check-in behaviour and a preview of what will change.
 *
 * The preview is not decoration: every row is a real code path, and an admin
 * who switches without seeing them will be surprised by the first check-in
 * that does or does not fire.
 */
export default function SettingsCoordination() {
  const { org, refresh } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<CoordinationMode>(DEFAULT_COORDINATION_MODE);
  const [busy, setBusy] = useState(false);

  const current = isCoordinationMode(org?.settings.coordination_mode)
    ? org.settings.coordination_mode
    : DEFAULT_COORDINATION_MODE;
  const source = org?.settings.coordination_mode_source ?? "default";

  useEffect(() => {
    setSelected(current);
  }, [current]);

  if (!org) return null;

  const changed = selected !== current;
  const nextCopy = coordinationCopy(selected);
  const currentCopy = coordinationCopy(current);

  async function save() {
    if (!org || !changed) return;
    setBusy(true);
    try {
      await db.updateOrg(org.id, {
        settings: {
          ...org.settings,
          coordination_mode: selected,
          coordination_mode_source: "chosen",
          coordination_mode_set_at: new Date().toISOString(),
        },
      });
      await refresh();
      toast("Coordination mode updated.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Coordination mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate">
            How your organization coordinates work. This drives how often Loop checks in, when it escalates and to
            whom, how quickly an item turns amber, and the words it uses — everywhere, including WhatsApp messages
            and the weekly report.
          </p>
          <p className="text-xs text-slate">
            Currently <strong className="text-ink">{currentCopy.label}</strong>
            {source === "inferred" && " — inferred from your onboarding answers"}
            {source === "default" && " — the default, never explicitly set"}
            {source === "chosen" && " — chosen by an admin"}.
          </p>
          <div className="space-y-2">
            {COORDINATION_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={selected === m}
                onClick={() => setSelected(m)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selected === m
                    ? "border-ink bg-mint/40"
                    : "border-[rgba(14,31,26,0.1)] hover:border-[rgba(14,31,26,0.3)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{COORDINATION_COPY[m].label}</span>
                  {m === current && (
                    <span className="rounded-full bg-[rgba(14,31,26,0.06)] px-2 py-0.5 text-[11px] font-medium text-slate">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate">{COORDINATION_COPY[m].description}</div>
                <div className="mt-1 text-xs text-slate">{COORDINATION_COPY[m].typicalOrganization}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{changed ? "What will change" : "What this mode does"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {changed && (
            <p className="text-sm text-amber">
              Switching to {nextCopy.label} changes check-in behaviour for every open item. Scheduled check-ins are
              re-evaluated on the next sweep; in-flight escalations keep the route they were raised under.
            </p>
          )}
          <PreviewRow
            label="Check-ins"
            from={currentCopy.changes.checkins}
            to={nextCopy.changes.checkins}
            changed={changed}
          />
          <PreviewRow
            label="Aging thresholds"
            from={currentCopy.changes.aging}
            to={nextCopy.changes.aging}
            changed={changed}
          />
          <PreviewRow
            label="Escalation"
            from={currentCopy.changes.escalation}
            to={nextCopy.changes.escalation}
            changed={changed}
          />
          <PreviewRow
            label="Weekly report"
            from={currentCopy.changes.report}
            to={nextCopy.changes.report}
            changed={changed}
          />
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-medium uppercase tracking-wide text-slate">Wording</div>
            <ul className="space-y-1 text-sm">
              {(["past_date", "owner", "escalate"] as const).map((key) => (
                <li key={key} className="flex flex-wrap items-baseline gap-2">
                  <code className="font-mono text-[11px] text-slate">{key}</code>
                  {changed && (
                    <>
                      <span className="text-slate line-through">{currentCopy.vocabulary[key]}</span>
                      <span className="text-slate">→</span>
                    </>
                  )}
                  <span className="font-medium text-ink">{nextCopy.vocabulary[key]}</span>
                </li>
              ))}
            </ul>
          </div>
          {selected === "standardized_skills" && (
            <p className="text-xs text-slate">
              In this mode Loop never asks a professional about the conduct of their own work, tracks only
              commitments owed to another party, and never routes an escalation to anyone who could be read as
              supervising professional judgement.
            </p>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => void save()} disabled={!changed || busy}>
        {busy ? "Saving…" : "Save coordination mode"}
      </Button>
    </>
  );
}

function PreviewRow({
  label,
  from,
  to,
  changed,
}: {
  label: string;
  from: string;
  to: string;
  changed: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate">{label}</div>
      {changed && <div className="text-sm text-slate line-through">{from}</div>}
      <div className="text-sm text-ink">{to}</div>
    </div>
  );
}
