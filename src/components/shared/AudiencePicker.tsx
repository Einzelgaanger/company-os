import { useMemo, useState } from "react";
import { Check, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";
import {
  DEFAULT_TAG_AUDIENCE,
  type Role,
  type TagAudience,
  type TagAudienceMode,
  type User,
} from "@/lib/types";

const MODES: { value: TagAudienceMode; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone", hint: "Anyone in the org cleared for this sensitivity" },
  { value: "only", label: "Only share with…", hint: "Just the people you pick" },
  { value: "except", label: "Everyone except…", hint: "The whole org minus the people you pick" },
  { value: "role", label: "By role", hint: "Everyone at or above a role" },
];

const ROLES: { value: Role; label: string }[] = [
  { value: "member", label: "Member and above (everyone)" },
  { value: "manager", label: "Manager and above" },
  { value: "admin", label: "Admin and owner" },
  { value: "owner", label: "Owner only" },
];

/**
 * Who can see data carrying a tag. Deliberately modelled on the WhatsApp
 * audience picker: pick a mode, then name people.
 */
export function AudiencePicker({
  value,
  users,
  onChange,
}: {
  value: TagAudience;
  users: User[];
  onChange: (next: TagAudience) => void;
}) {
  const [query, setQuery] = useState("");
  const audience = { ...DEFAULT_TAG_AUDIENCE, ...value };
  const needsMembers = audience.mode === "only" || audience.mode === "except";

  const selectable = useMemo(
    () => users.filter((u) => u.status !== "disabled"),
    [users],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [selectable, query]);

  // `only` and `except` read the same list in opposite directions, so carrying
  // names across would silently invert who has access. Start the new mode empty
  // instead; `only` with nobody picked blocks saving.
  function setMode(mode: TagAudienceMode) {
    const inverts =
      (audience.mode === "only" && mode === "except") ||
      (audience.mode === "except" && mode === "only");
    onChange({ ...audience, mode, member_ids: inverts ? [] : audience.member_ids });
  }

  function toggleMember(id: string) {
    const has = audience.member_ids.includes(id);
    onChange({
      ...audience,
      member_ids: has
        ? audience.member_ids.filter((m) => m !== id)
        : [...audience.member_ids, id],
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Who can see data with this tag</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = audience.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  active
                    ? "border-teal bg-teal/5"
                    : "border-border hover:bg-secondary/50",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  {active && <Check className="h-3.5 w-3.5 text-teal" />}
                  {m.label}
                </div>
                <div className="mt-0.5 text-xs text-slate">{m.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {audience.mode === "role" && (
        <div className="space-y-1.5">
          <Label>Minimum role</Label>
          <div className="space-y-1">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => onChange({ ...audience, min_role: r.value })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                  audience.min_role === r.value
                    ? "border-teal bg-teal/5 text-ink"
                    : "border-border text-slate hover:bg-secondary/50",
                )}
              >
                {audience.min_role === r.value && <Check className="h-3.5 w-3.5 text-teal" />}
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {needsMembers && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>
              {audience.mode === "only" ? "People with access" : "People to exclude"}
            </Label>
            <span className="text-xs text-slate">{audience.member_ids.length} selected</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate" />
            <Input
              className="pl-8"
              placeholder="Search teammates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate">No teammates match.</p>
            ) : (
              filtered.map((u) => {
                const picked = audience.member_ids.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u.id)}
                    className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-secondary/50"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback>{initials(u.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{u.full_name}</span>
                      <span className="block truncate text-xs text-slate">
                        {u.email} · {u.role}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        picked ? "border-teal bg-teal text-white" : "border-border",
                      )}
                    >
                      {picked && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {audience.mode === "only" && audience.member_ids.length === 0 && (
            <p className="text-xs text-red">Pick at least one person, or switch to Everyone.</p>
          )}
        </div>
      )}

      <label className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
        <span>
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            <Users className="h-3.5 w-3.5 text-slate" /> Admins keep access
          </span>
          <span className="mt-0.5 block text-xs text-slate">
            On, owners and admins can always read this data. Off, the audience holds against them
            too — use for HR or investigation tags. Either way every read is written to the access
            log.
          </span>
        </span>
        <Switch
          checked={audience.admin_override}
          onCheckedChange={(v) => onChange({ ...audience, admin_override: Boolean(v) })}
        />
      </label>
    </div>
  );
}
