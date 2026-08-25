import { cn } from "@/lib/utils";

export type FeverZone = "green" | "amber" | "red" | "unknown";

/**
 * Fever chart — buffer consumed % vs chain complete % (04_FLOW_ENGINE §4.7).
 * Zones use design tokens; caption is required so colour is never the only signal.
 */
export function FeverChart({
  bufferConsumedPct,
  chainCompletePct,
  zone,
  caption,
  className,
}: {
  bufferConsumedPct: number;
  chainCompletePct: number;
  zone: FeverZone;
  caption: string;
  className?: string;
}) {
  const x = Math.min(Math.max(chainCompletePct, 0), 100);
  const y = Math.min(Math.max(bufferConsumedPct, 0), 100);
  const zoneColor =
    zone === "green"
      ? "var(--fever-ok)"
      : zone === "amber"
        ? "var(--fever-watch)"
        : zone === "red"
          ? "var(--fever-act)"
          : "#5A6B7D";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative aspect-[4/3] w-full max-w-sm rounded-md border border-[rgba(14,31,26,0.12)] bg-[#f7faf6]">
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          <polygon points="0,100 100,100 100,0" fill="var(--fever-ok)" opacity="0.12" />
          <polygon points="0,100 66,100 100,50 100,0 0,0" fill="var(--fever-watch)" opacity="0.1" />
          <polygon points="0,0 0,100 66,100 100,50" fill="var(--fever-act)" opacity="0.08" />
          <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(14,31,26,0.2)" strokeWidth="0.5" />
          <circle
            cx={x}
            cy={100 - y}
            r="3.5"
            fill={zoneColor}
            stroke="#0E1F1A"
            strokeWidth="0.8"
          />
        </svg>
        <div className="pointer-events-none absolute bottom-1 left-2 text-[9px] font-medium uppercase tracking-wide text-[#5A6B7D]">
          Chain complete →
        </div>
        <div className="pointer-events-none absolute left-1 top-2 origin-left -rotate-90 text-[9px] font-medium uppercase tracking-wide text-[#5A6B7D]">
          Buffer spent →
        </div>
      </div>
      <p className="text-sm text-ink">
        <span
          className="mr-2 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white"
          style={{ background: zoneColor }}
        >
          {zone}
        </span>
        {caption}
      </p>
      <p className="font-mono text-xs text-slate">
        Buffer {Math.round(bufferConsumedPct)}% · Chain {Math.round(chainCompletePct)}%
      </p>
    </div>
  );
}

/** Local fever reading mirror of @loop/shared feverReading for the SPA. */
export function readFever(input: {
  bufferDays: number | null;
  bufferConsumedDays: number;
  chainCompletePct: number;
  commitmentCount: number;
  hasTargetEndDate: boolean;
}): { zone: FeverZone; bufferConsumedPct: number; chainCompletePct: number; caption: string } {
  const chain = Math.round(Math.min(Math.max(input.chainCompletePct, 0), 100) * 100) / 100;
  if (
    input.commitmentCount < 3 ||
    !input.hasTargetEndDate ||
    input.bufferDays == null ||
    input.bufferDays <= 0
  ) {
    return {
      zone: "unknown",
      bufferConsumedPct: 0,
      chainCompletePct: chain,
      caption: "Not enough signal yet — this needs a target end date and at least 3 commitments.",
    };
  }
  const consumed =
    Math.round(Math.min((input.bufferConsumedDays / input.bufferDays) * 100, 999) * 100) / 100;
  if (consumed >= 90) {
    return {
      zone: "red",
      bufferConsumedPct: consumed,
      chainCompletePct: chain,
      caption: `${consumed}% of the buffer is gone. The end date is at risk whatever the chain says.`,
    };
  }
  if (consumed <= chain) {
    return {
      zone: "green",
      bufferConsumedPct: consumed,
      chainCompletePct: chain,
      caption: `Buffer is being spent slower than the chain is completing (${consumed}% vs ${chain}%).`,
    };
  }
  if (chain > 0 && consumed <= chain * 1.5) {
    return {
      zone: "amber",
      bufferConsumedPct: consumed,
      chainCompletePct: chain,
      caption: `Buffer is running ahead of progress (${consumed}% spent, ${chain}% complete). Worth a look at what is waiting.`,
    };
  }
  return {
    zone: "red",
    bufferConsumedPct: consumed,
    chainCompletePct: chain,
    caption: `Buffer is far ahead of the chain (${consumed}% vs ${chain}%). Protect the end date.`,
  };
}
