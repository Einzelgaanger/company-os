import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { roleAtLeast } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  COORDINATION_COPY,
  COORDINATION_MODES,
  DECISION_OPTIONS,
  PROCEDURE_OPTIONS,
  coordinationCopy,
  inferCoordinationMode,
  type CoordinationMode,
  type DecisionAnswer,
  type ProcedureAnswer,
} from "@/lib/coordination";

/**
 * B4 — 03_COORDINATION_MODES.md §3.6. Placed after the C-3 notice and before
 * profile, because the mode changes check-in behaviour and nothing should be
 * scheduled before it is set.
 *
 * Three plain questions, then the inferred mode. Nobody is asked what their
 * coordination mechanism is — the answer to that question is always a blank
 * look. `coordination_mode_source` records whether the admin took the
 * inference or overrode it, so the inference can be scored later.
 */
export default function OnbCoordination() {
  const { user, org, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<DecisionAnswer | null>(null);
  const [procedure, setProcedure] = useState<ProcedureAnswer | null>(null);
  const [professionals, setProfessionals] = useState<boolean | null>(null);
  const [override, setOverride] = useState<CoordinationMode | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  // The mode is an org-wide setting, so only an admin is asked. Everyone else
  // goes straight on to their profile.
  const isAdmin = user ? roleAtLeast(user.role, "admin") : false;
  useEffect(() => {
    if (user && !isAdmin) navigate("/onboarding/profile", { replace: true });
  }, [user, isAdmin, navigate]);

  const answered = decisions !== null && procedure !== null && professionals !== null;
  const inference =
    answered && decisions && procedure
      ? inferCoordinationMode({ decisions, procedure, professionals: professionals === true })
      : null;
  const mode = override ?? inference?.mode ?? null;
  const copy = mode ? coordinationCopy(mode) : null;

  async function saveAndContinue() {
    if (!org || !mode) return;
    setBusy(true);
    try {
      await db.updateOrg(org.id, {
        settings: {
          ...org.settings,
          coordination_mode: mode,
          coordination_mode_source: override ? "chosen" : "inferred",
          coordination_mode_set_at: new Date().toISOString(),
        },
      });
      await refresh();
      navigate("/onboarding/profile");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not save the coordination mode.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout
      step={1}
      title="How your team coordinates"
      description="Three questions. They set how often Loop checks in, how quickly it escalates, and the words it uses."
    >
      <div className="space-y-6 text-sm">
        <Question label="When someone on your team needs a decision, what usually happens?">
          {DECISION_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              selected={decisions === o.value}
              onSelect={() => {
                setDecisions(o.value);
                setOverride(null);
              }}
            />
          ))}
        </Question>

        <Question label="How much of your team's work follows a defined, repeatable procedure?">
          {PROCEDURE_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              selected={procedure === o.value}
              onSelect={() => {
                setProcedure(o.value);
                setOverride(null);
              }}
            />
          ))}
        </Question>

        <Question label="Are most of your team qualified professionals who decide how their own work gets done?">
          <p className="pb-1 text-[13px] font-medium text-[#5A6B7D]">
            Lawyers, doctors, engineers, accountants, architects.
          </p>
          <Choice
            label="Yes"
            selected={professionals === true}
            onSelect={() => {
              setProfessionals(true);
              setOverride(null);
            }}
          />
          <Choice
            label="No"
            selected={professionals === false}
            onSelect={() => {
              setProfessionals(false);
              setOverride(null);
            }}
          />
        </Question>

        {mode && copy && (
          <div className="rounded-xl border border-[rgba(14,31,26,0.1)] bg-[#F6F8F7] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5A6B7D]">
              {override ? "You chose" : "Sounds like"}
            </div>
            <div className="mt-1 text-base font-bold text-[#0E1F1A]">{copy.label}</div>
            <p className="mt-1 font-medium leading-relaxed text-[#0E1F1A]">{copy.description}</p>
            {!override && inference && (
              <p className="mt-2 text-[13px] font-medium text-[#5A6B7D]">{inference.rationale}</p>
            )}
            <button
              type="button"
              className="mt-3 text-[13px] font-semibold text-teal hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Hide the other options" : "Change this"}
            </button>
          </div>
        )}

        {mode && showAll && (
          <div className="space-y-2">
            {COORDINATION_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setOverride(m);
                  setShowAll(false);
                }}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  m === mode
                    ? "border-[#0E1F1A] bg-white"
                    : "border-[rgba(14,31,26,0.1)] bg-white hover:border-[rgba(14,31,26,0.3)]",
                )}
              >
                <div className="font-semibold text-[#0E1F1A]">{COORDINATION_COPY[m].label}</div>
                <div className="text-[13px] font-medium text-[#5A6B7D]">
                  {COORDINATION_COPY[m].typicalOrganization}
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="text-[11px] font-medium text-[#5A6B7D]">
          You can change this later at <strong>Settings → Coordination</strong>.
        </p>

        <Button
          className="btn-primary"
          disabled={!mode || busy}
          onClick={() => void saveAndContinue()}
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      </div>
    </OnboardingLayout>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="pb-1 font-semibold text-[#0E1F1A]">{label}</legend>
      {children}
    </fieldset>
  );
}

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left font-medium transition-colors",
        selected
          ? "border-[#0E1F1A] bg-white text-[#0E1F1A]"
          : "border-[rgba(14,31,26,0.1)] bg-white text-[#0E1F1A] hover:border-[rgba(14,31,26,0.3)]",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-full border-2",
          selected ? "border-[#0E1F1A] bg-[#D3F36B]" : "border-[rgba(14,31,26,0.25)]",
        )}
      />
      <span>{label}</span>
    </button>
  );
}
