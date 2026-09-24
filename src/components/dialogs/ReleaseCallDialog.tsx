import { useEffect, useMemo, useState } from "react";
import { Lock, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagChip } from "@/components/governance";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { audienceSummary, isRestrictedAudience, whoCanSee } from "@/lib/tagAccess";
import { SENSITIVITY_LABEL, type Meeting, type Sensitivity, type Tag, type User } from "@/lib/types";

const LEVELS: Sensitivity[] = ["public", "internal", "confidential", "restricted"];

export function ReleaseCallDialog({
  meeting,
  tags,
  users,
  open,
  onOpenChange,
  onStored,
}: {
  meeting: Meeting | null;
  tags: Tag[];
  users: User[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStored?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [held, setHeld] = useState<Meeting | null>(meeting);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !meeting) return;
    setHeld(meeting);
    setSensitivity(meeting.sensitivity ?? "internal");
    setSelected(meeting.tag_ids ?? []);
  }, [open, meeting]);

  const viewers = useMemo(
    () =>
      whoCanSee(
        { sensitivity, tagIds: selected },
        tags,
        users,
      ),
    [sensitivity, selected, tags, users],
  );

  function toggleTag(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((t) => t !== id) : [...s, id]));
  }

  async function storeCall() {
    if (!user || !held) return;
    setBusy(true);
    try {
      await db.releaseMeeting(user, held.id, sensitivity, selected);
      toast("Call stored. Commitments inherit this privacy tag.", "success");
      onOpenChange(false);
      onStored?.();
    } finally {
      setBusy(false);
    }
  }

  const names = viewers.map((v) => v.full_name);
  const preview =
    names.length === 0
      ? "Nobody — this combination locks everyone out"
      : names.length <= 3
        ? names.join(", ")
        : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tag this call</DialogTitle>
          <DialogDescription>
            The whole meeting is one batch. Set who can see it, then store it — nothing is
            extracted until you do.
          </DialogDescription>
        </DialogHeader>
        {held && (
          <div className="space-y-4">
            <div>
              <div className="font-medium">{held.title ?? "Untitled call"}</div>
              <p className="text-xs text-slate">
                {held.participants.map((p) => p.name).join(", ") || "No participants"}
              </p>
              {held.transcript_text && (
                <p className="mt-2 line-clamp-3 rounded-md bg-secondary/50 px-3 py-2 text-sm">
                  {held.transcript_text}
                </p>
              )}
            </div>
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
              <Label>Privacy tags</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = selected.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      aria-pressed={active}
                      title={audienceSummary(t, users)}
                      className={active ? "" : "opacity-40"}
                    >
                      <span className="inline-flex items-center gap-1">
                        <TagChip tag={t} />
                        {isRestrictedAudience(t) && <Lock className="h-3 w-3 text-slate" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate">
                <Users className="h-3.5 w-3.5" />
                Who will see this call
                <span className="normal-case tracking-normal">
                  · {viewers.length} of {users.length}
                </span>
              </div>
              <p className="text-sm">{preview}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={storeCall} disabled={busy || !held}>Store call</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
