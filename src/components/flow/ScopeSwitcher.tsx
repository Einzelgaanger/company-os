import { SCOPE_LABEL, type FlowScope } from "@/lib/flow";
import { cn } from "@/lib/utils";

/**
 * Scope switcher for /flow and /waiting (08_PAGES §8.4).
 *
 * Scopes above the viewer's role are absent, not disabled — a control the user
 * can see but never use is a standing reminder of a permission they do not have.
 * The server refuses a wider scope regardless; this only mirrors the matrix.
 */
export function ScopeSwitcher({
  scope,
  allowed,
  onChange,
}: {
  scope: FlowScope;
  allowed: FlowScope[];
  onChange: (next: FlowScope) => void;
}) {
  if (allowed.length < 2) return null;
  return (
    <div
      role="group"
      aria-label="Scope"
      className="inline-flex rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-0.5"
    >
      {allowed.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={scope === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#5A6B7D] transition-colors",
            scope === option ? "bg-[#0E1F1A] text-white" : "hover:bg-[#F7FAF6]",
          )}
        >
          {SCOPE_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
