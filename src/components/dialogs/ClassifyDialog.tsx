import { useState } from "react";
import { Tag as TagIcon, Sparkles } from "lucide-react";
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
import { SENSITIVITY_LABEL, type Commitment, type Sensitivity, type Tag } from "@/lib/types";

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
  const [busy, setBusy] = useState(false);

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
                return (
                  <button key={t.id} onClick={() => toggleTag(t.id)} className={active ? "" : "opacity-40"}>
                    <TagChip tag={t} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
