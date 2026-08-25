import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const STEPS = ["Organization", "Compliance", "Profile", "Connections", "Team"];

function ProgressRing({ step }: { step: number }) {
  const total = STEPS.length;
  const pct = ((step + 1) / total) * 100;
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
          {step + 1}/{total}
        </text>
      </svg>
      <div className="text-sm">
        <div className="font-semibold text-[#0E1F1A]">{STEPS[step]}</div>
        <div className="text-[11px] font-medium text-[#5A6B7D]">
          Step {step + 1} of {total}
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
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-[#EEF2EE]">
      <div className="flex items-center justify-between p-6">
        <Logo />
      </div>
      <div className="flex justify-center px-4 pb-16">
        <div className="w-full max-w-xl animate-fade-in">
          <div className="mb-5 flex items-center justify-between">
            <ProgressRing step={step} />
            <div className="hidden gap-1 sm:flex">
              {STEPS.map((s, i) => (
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
              {description && <p className="mt-1 text-[13px] font-medium text-[#5A6B7D]">{description}</p>}
              <div className="mt-5">{children}</div>
            </div>
          </div>
          {footer && <div className="mt-4 flex justify-between gap-2">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
