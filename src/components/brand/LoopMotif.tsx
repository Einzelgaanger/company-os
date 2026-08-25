import { cn } from "@/lib/utils";

const STEPS = ["Detect", "Track", "Check", "Nudge", "Escalate", "Report"];

/**
 * Six-beat Loop ring — forest/lime grammar. Dashboard empty + onboarding only.
 */
export function LoopMotif({
  size = 220,
  activeStep,
  className,
}: {
  size?: number;
  activeStep?: number;
  className?: string;
}) {
  const radius = size / 2 - 26;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("select-none", className)}
      role="img"
      aria-label="Loop: Detect, Track, Check, Nudge, Escalate, Report"
    >
      <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(14,31,26,0.12)" strokeWidth={2} />
      {STEPS.map((label, i) => {
        const angle = (i / STEPS.length) * Math.PI * 2 - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const active = activeStep === undefined || i <= activeStep;
        return (
          <g key={label}>
            <circle cx={x} cy={y} r={6} fill={active ? "#D3F36B" : "#E8F0EA"} />
            <text
              x={x}
              y={y - 14}
              textAnchor="middle"
              fontSize={11}
              fontFamily='"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif'
              fontWeight={600}
              fill={active ? "#0E1F1A" : "#5A6B7D"}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
