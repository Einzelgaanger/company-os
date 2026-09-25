import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = ["Organization", "Compliance", "Coordination", "Profile", "Connections", "Team"];

const STEP_PATH: Record<string, string> = {
  Organization: "/onboarding/organization",
  Compliance: "/onboarding/compliance",
  Coordination: "/onboarding/coordination",
  Profile: "/onboarding/profile",
  Connections: "/onboarding/connections",
  Team: "/onboarding/team",
  Notice: "/onboarding/notice",
};

function ProgressRing({ step, steps, finished }: { step: number; steps: string[]; finished?: boolean }) {
  const total = steps.length;
  const shown = finished ? total : Math.min(step + 1, total);
  const pct = (shown / total) * 100;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width={52} height={52} viewBox="0 0 52 52">
        <circle cx={26} cy={26} r={r} fill="none" stroke="rgba(14,31,26,0.1)" strokeWidth={4} />
        <circle
          cx={26}
          cy={26}
          r={r}
          fill="none"
          stroke="#D3F36B"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          transform="rotate(-90 26 26)"
        />
        <text
          x={26}
          y={30}
          textAnchor="middle"
          fontSize={12}
          fontFamily="IBM Plex Mono, monospace"
          fontWeight={600}
          fill="#0E1F1A"
        >
          {shown}/{total}
        </text>
      </svg>
      <div className="text-sm">
        <div className="font-semibold text-[#0E1F1A]">{finished ? "Done" : (steps[step] ?? "Done")}</div>
        <div className="text-[11px] font-medium text-[#5B6560]">
          {finished ? "Setup complete" : `Step ${shown} of ${total}`}
        </div>
      </div>
    </div>
  );
}

export function OnboardingLayout({
  step,
  title,
  description,
  children,
  footer,
  steps = STEPS,
  finished = false,
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Last screen. Never counts as an extra step. */
  finished?: boolean;
  /** Override the rail when this page is not on the admin wizard (the notice). */
  steps?: string[];
}) {
  const navigate = useNavigate();
  const previous = steps[step - 1];
  const following = steps[step + 1];
  const previousPath = previous ? STEP_PATH[previous] : undefined;
  const followingPath = following ? STEP_PATH[following] : undefined;

  return (
    <div className="onboarding-shell min-h-[100dvh] bg-[#EFEFEE]">
      <div className="flex items-center justify-between p-6 max-lg:px-4 max-lg:pt-[max(1rem,env(safe-area-inset-top))]">
        <Logo />
      </div>
      <div className="flex justify-center px-4 pb-16 max-lg:px-3 max-lg:pb-[max(6rem,calc(env(safe-area-inset-bottom)+4.5rem))]">
        <div className="w-full max-w-xl animate-fade-in">
          <div className="mb-5 flex items-center justify-between">
            <ProgressRing step={step} steps={steps} finished={finished} />
            <div className="hidden gap-1 sm:flex">
              {steps.map((s, i) => (
                <span
                  key={s}
                  className={cn("h-1.5 w-8 rounded-full", i <= step ? "bg-[#D3F36B]" : "bg-[rgba(14,31,26,0.1)]")}
                  title={s}
                />
              ))}
            </div>
          </div>
          <div className="portal-section">
            <div className="portal-section__body--pad sm:!p-6">
              <h1 className="text-xl font-bold tracking-tight text-[#0E1F1A]">{title}</h1>
              {description && <p className="mt-1 text-[13px] font-medium text-[#5B6560]">{description}</p>}
              <div className="mt-5">{children}</div>
            </div>
          </div>
          <div className="onboarding-nav mt-4 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!previousPath}
              onClick={() => previousPath && navigate(previousPath)}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              {footer}
              {!finished && (
                <Button
                  type="button"
                  variant="outline"
                  className={cn(!followingPath && "max-lg:hidden")}
                  disabled={!followingPath}
                  onClick={() => followingPath && navigate(followingPath)}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
