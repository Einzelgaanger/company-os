import { useEffect, useMemo, useState } from "react";
import { Tag as TagIcon, Sparkles, Lock, AlertTriangle, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagChip } from "@/components/governance";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { classify } from "@/lib/classify";
import { audienceSummary, blockingTags, isRestrictedAudience, whoCanSee } from "@/lib/tagAccess";
import { SENSITIVITY_LABEL, type Commitment, type Sensitivity, type Tag, type User } from "@/lib/types";

const LEVELS: Sensitivity[] = ["public", "internal", "confidential", "restricted"];

export function ClassifyDialog({
  commitment,
  tags,
  onSaved,
}: {
  commitment: Commitment;
  tags: Tag[];
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(commitment.sensitivity ?? "internal");
  const [selected, setSelected] = useState<string[]>(commitment.tag_ids ?? []);
  const [members, setMembers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  // The audience preview needs the roster; without it the dialog would claim
  // nobody can see anything.
  useEffect(() => {
    if (!open || !user) return;
    setSensitivity(commitment.sensitivity ?? "internal");
    setSelected(commitment.tag_ids ?? []);
    db.listUsers(user.org_id).then(setMembers);
  }, [open, user, commitment.sensitivity, commitment.tag_ids]);

  const label = useMemo(
    () => ({
      sensitivity,
      tagIds: selected,
      ownerId: commitment.owner_id,
      requesterId: commitment.requested_by_id,
    }),
    [sensitivity, selected, commitment.owner_id, commitment.requested_by_id],
  );

  const viewers = useMemo(
    () => (members.length ? whoCanSee(label, tags, members) : []),
    [label, tags, members],
  );
  const lockedOutOfOwn = user ? blockingTags(selected, tags, user) : [];

  function toggleTag(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((t) => t !== id) : [...s, id]));
  }

  function suggest() {
    const c = classify(commitment.title, commitment.description);
    setSensitivity(c.sensitivity);
    const byName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
    setSelected(c.tags.map((n) => byName.get(n)).filter(Boolean) as string[]);
    toast(c.rationale, "default");
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    try {
      await db.classifyCommitment(user, commitment.id, sensitivity, selected);
      toast("Saved.", "success");
      setOpen(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  const names = viewers.map((v) => v.full_name);
  const preview =
    members.length === 0
      ? "Working out who has access…"
      : names.length === 0
        ? "Nobody — this combination locks everyone out"
        : names.length <= 3
          ? names.join(", ")
          : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <TagIcon className="h-4 w-4" /> Classify
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classify data</DialogTitle>
          <DialogDescription>Set the sensitivity and tags that govern who can see this and how it's retained.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="text-teal" onClick={suggest}>
            <Sparkles className="h-4 w-4" /> Suggest classification
          </Button>
          <div className="space-y-1.5">
            <Label>Sensitivity</Label>
            <Select value={sensitivity} onValueChange={(v) => setSensitivity(v as Sensitivity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>{SENSITIVITY_LABEL[l]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const active = selected.includes(t.id);
                const restricted = isRestrictedAudience(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    aria-pressed={active}
                    title={members.length ? audienceSummary(t, members) : t.name}
                    className={active ? "" : "opacity-40"}
                  >
                    <span className="inline-flex items-center gap-1">
                      <TagChip tag={t} />
                      {restricted && <Lock className="h-3 w-3 text-slate" aria-label="Limited audience" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate">
              Tags with a lock narrow who can open this. Several tags intersect — each one can only take people away.
            </p>
          </div>

          <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate">
              <Users className="h-3.5 w-3.5" />
              Who will see this
              {members.length > 0 && (
                <span className="normal-case tracking-normal">
                  · {viewers.length} of {members.length}
                </span>
              )}
            </div>
            <p className="text-sm">{preview}</p>
          </div>

          {lockedOutOfOwn.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <span>
                You are not in the audience for{" "}
                <strong>{lockedOutOfOwn.map((t) => t.name).join(", ")}</strong>, so you won't be able to
                open this after saving. Ask an admin to reopen it, or change the tag's audience first.
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
