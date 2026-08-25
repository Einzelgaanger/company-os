import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accents §9.3 / §7.3. A card that reports a flow state takes a status accent
 * (`moving` | `waiting` | `review` | `attention` | `done`); a card that reports
 * something neutral takes a brand accent. The two sets never mix, and the legacy
 * gold/amber aliases now resolve into the status set so no screen keeps using a
 * brand colour to mean "at risk".
 */
const BAR: Record<string, string> = {
  lime: "bg-[#D3F36B]",
  forest: "bg-brand-ink",
  moving: "bg-status-moving",
  ready: "bg-status-ready",
  waiting: "bg-status-waiting",
  review: "bg-status-review",
  attention: "bg-status-attention",
  done: "bg-status-done",
  // aliases retained so existing callers keep rendering
  gold: "bg-status-waiting",
  amber: "bg-status-waiting",
  red: "bg-status-attention",
  green: "bg-status-done",
  teal: "bg-brand-ink",
  blue: "bg-brand-ink",
};

const WELL: Record<string, string> = {
  lime: "bg-[rgba(211,243,107,0.25)] text-brand-ink",
  forest: "bg-[rgba(14,31,26,0.1)] text-brand-ink",
  moving: "bg-status-moving-tint text-status-moving-ink",
  ready: "bg-status-ready-tint text-status-ready-ink",
  waiting: "bg-status-waiting-tint text-status-waiting-ink",
  review: "bg-status-review-tint text-status-review-ink",
  attention: "bg-status-attention-tint text-status-attention-ink",
  done: "bg-status-done-tint text-status-done-ink",
  gold: "bg-status-waiting-tint text-status-waiting-ink",
  amber: "bg-status-waiting-tint text-status-waiting-ink",
  red: "bg-status-attention-tint text-status-attention-ink",
  green: "bg-status-done-tint text-status-done-ink",
  teal: "bg-[rgba(14,31,26,0.1)] text-brand-ink",
  blue: "bg-[rgba(14,31,26,0.1)] text-brand-ink",
};

/**
 * §7.10 — repurposed for flow metrics rather than counts. `detail` carries the
 * one line that makes the number actionable (who holds it, which way it moved)
 * and `chart` takes a sparkline.
 */
export function StatCard({
  label,
  value,
  detail,
  chart,
  icon: Icon,
  accent = "lime",
  onClick,
}: {
  label: string;
  value: string | number;
  detail?: string;
  chart?: ReactNode;
  icon?: LucideIcon;
  accent?: keyof typeof BAR;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cn("stat-card__bar", BAR[accent] ?? BAR.lime)} />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[#5A6B7D]">{label}</div>
          <div className="mt-0.5 text-lg font-extrabold tracking-tight text-[#0E1F1A] sm:text-xl">{value}</div>
          {detail && (
            <div className="mt-0.5 truncate text-[11px] font-medium text-[#5A6B7D]">{detail}</div>
          )}
        </div>
        {Icon && (
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", WELL[accent] ?? WELL.lime)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        )}
      </div>
      {chart && <div className="mt-1.5 pl-1.5">{chart}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="stat-card w-full text-left">
        {body}
      </button>
    );
  }
  return <div className="stat-card">{body}</div>;
}
