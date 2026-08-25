import { Lock, Globe, Building2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SENSITIVITY_LABEL, type Sensitivity, type Tag } from "@/lib/types";

const SENS_STYLE: Record<Sensitivity, { variant: "default" | "teal" | "amber" | "red" | "green"; icon: typeof Lock }> = {
  public: { variant: "green", icon: Globe },
  internal: { variant: "teal", icon: Building2 },
  confidential: { variant: "amber", icon: Lock },
  restricted: { variant: "red", icon: ShieldAlert },
};

export function SensitivityBadge({ sensitivity }: { sensitivity?: Sensitivity }) {
  const s = sensitivity ?? "internal";
  const { variant, icon: Icon } = SENS_STYLE[s];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {SENSITIVITY_LABEL[s]}
    </Badge>
  );
}

const TAG_COLOR: Record<string, string> = {
  teal: "bg-teal/10 text-teal",
  amber: "bg-amber/10 text-amber",
  red: "bg-red/10 text-red",
  green: "bg-green/10 text-green",
  slate: "bg-slate/10 text-slate",
};

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TAG_COLOR[tag.color] ?? TAG_COLOR.slate)}>
      {tag.pii && <ShieldAlert className="h-3 w-3" />}
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100" aria-label={`Remove ${tag.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function TagChips({ tags, allTags }: { tags: string[]; allTags: Tag[] }) {
  const map = new Map(allTags.map((t) => [t.id, t]));
  const resolved = tags.map((id) => map.get(id)).filter(Boolean) as Tag[];
  if (resolved.length === 0) return <span className="text-xs text-slate">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {resolved.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
    </span>
  );
}
