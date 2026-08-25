import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "pending" | "danger" | "neutral" | "info" | "pipeline";

const TONE: Record<StatusTone, string> = {
  ok: "bg-[#F4FBE3] text-[#1A3A2E]",
  pending: "bg-[#FFF8E0] text-[#8A6A00]",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-[#F7FAF6] text-[#5A6B7D]",
  info: "bg-blue-50 text-blue-700",
  pipeline: "bg-[#E8F0EA] text-[#0E1F1A]",
};

/** Soft pastel mono uppercase badge — §9.2 */
export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
