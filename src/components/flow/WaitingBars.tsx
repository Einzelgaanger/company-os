import type { WaitingGroup } from "@/lib/flow";
import { cn } from "@/lib/utils";

/**
 * Waiting-by-holder bars — 07_DESIGN_SYSTEM §7.7. Horizontal, aligned baseline,
 * sorted descending by total waiting days.
 *
 * §7.4: position along a common scale is read more accurately than any other
 * encoding, which is why this is bars and not a donut. The figure is printed at
 * the end of every bar so the chart is readable without reference to the axis.
 */
export function WaitingBars({
  groups,
  selectedKey,
  onSelect,
  max = 8,
}: {
  groups: WaitingGroup[];
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  max?: number;
}) {
  const visible = groups.slice(0, max);
  const peak = Math.max(1, ...visible.map((g) => g.workingDays));

  return (
    <ul className="space-y-1.5">
      {visible.map((group) => {
        const pct = Math.max(2, (group.workingDays / peak) * 100);
        const selected = selectedKey === group.key;
        return (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => onSelect?.(group.key)}
              disabled={!onSelect}
              className={cn(
                "grid w-full grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2 rounded px-1 py-1 text-left",
                onSelect && "hover:bg-[#F7FAF6]",
                selected && "bg-[#F4FBE3]",
              )}
            >
              <span className="truncate text-[11px] font-semibold text-[#0E1F1A]">
                {group.label}
              </span>
              <span className="h-2.5 w-full rounded-sm bg-[rgba(14,31,26,0.06)]">
                <span
                  className="block h-full rounded-sm bg-status-waiting"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="whitespace-nowrap font-mono text-[11px] text-[#5A6B7D]">
                {group.workingDays.toFixed(1)}d · {group.itemCount}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
