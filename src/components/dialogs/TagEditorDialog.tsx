import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AudiencePicker } from "@/components/shared/AudiencePicker";
import { TagChip } from "@/components/governance";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { audienceCount, audienceSummary } from "@/lib/tagAccess";
import {
  DEFAULT_TAG_AUDIENCE,
  SENSITIVITY_LABEL,
  type Sensitivity,
  type Tag,
  type TagAudience,
  type User,
} from "@/lib/types";

const LEVELS: Sensitivity[] = ["public", "internal", "confidential", "restricted"];

// Written out rather than interpolated so Tailwind keeps the classes.
const COLORS: { key: string; swatch: string }[] = [
  { key: "teal", swatch: "bg-teal" },
  { key: "amber", swatch: "bg-amber" },
  { key: "red", swatch: "bg-red" },
  { key: "green", swatch: "bg-green" },
  { key: "slate", swatch: "bg-slate" },
];

const COLOR_FOR: Record<Sensitivity, string> = {
  public: "green",
  internal: "teal",
  confidential: "amber",
  restricted: "red",
};

interface Draft {
  name: string;
  classification: Sensitivity;
  color: string;
  pii: boolean;
  description: string;
  audience: TagAudience;
}

function draftFrom(tag: Tag | null): Draft {
  return {
    name: tag?.name ?? "",
    classification: tag?.classification ?? "confidential",
    color: tag?.color ?? COLOR_FOR[tag?.classification ?? "confidential"],
    pii: tag?.pii ?? false,
    description: tag?.description ?? "",
    audience: { ...DEFAULT_TAG_AUDIENCE, ...(tag?.audience ?? {}) },
  };
}

/**
 * Create or edit a tag, including the audience that decides who can read data
 * carrying it. Saving an audience change takes effect on existing data too, so
 * the dialog says so before you commit.
 */
export function TagEditorDialog({
  open,
  tag,
  users,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** null = create a new tag. */
  tag: Tag | null;
  users: User[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  // Snapshot the tag on open so the title and the form stay in step through the
  // close animation, when the caller has already cleared its selection.
  const [editingTag, setEditingTag] = useState<Tag | null>(tag);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(tag));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEditingTag(tag);
    setDraft(draftFrom(tag));
  }, [open, tag]);

  const audienceIsEmpty = draft.audience.mode === "only" && draft.audience.member_ids.length === 0;
  const canSave = Boolean(draft.name.trim()) && !audienceIsEmpty && !busy;

  const preview: Tag = {
    id: editingTag?.id ?? "preview",
    org_id: user?.org_id ?? "",
    name: draft.name.trim().toLowerCase() || "new tag",
    color: draft.color,
    classification: draft.classification,
    pii: draft.pii,
    description: draft.description || null,
    audience: draft.audience,
    created_at: editingTag?.created_at ?? new Date().toISOString(),
  };

  async function save() {
    if (!user || !canSave) return;
    setBusy(true);
    try {
      const fields = {
        name: draft.name.trim().toLowerCase(),
        color: draft.color,
        classification: draft.classification,
        pii: draft.pii,
        description: draft.description.trim() || null,
        audience: draft.audience,
      };
      if (editingTag) await db.updateTag(editingTag.id, fields, user);
      else await db.createTag({ org_id: user.org_id, ...fields });
      toast(
        editingTag
          ? `"${fields.name}" updated — ${audienceCount(preview, users)} people have access.`
          : `Tag "${fields.name}" created.`,
        "success",
      );
      onOpenChange(false);
      onSaved();
    } catch {
      toast("Could not save the tag.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingTag ? `Edit "${editingTag.name}"` : "New tag"}</DialogTitle>
          <DialogDescription>
            A tag does two jobs: it classifies data and it decides who can read it. Changing the
            audience applies to everything already labelled with this tag.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={draft.name}
                placeholder="e.g. board matters"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default classification</Label>
              <Select
                value={draft.classification}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    classification: v as Sensitivity,
                    color: COLOR_FOR[v as Sensitivity],
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{SENSITIVITY_LABEL[l]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tag-desc">Description</Label>
            <Input
              id="tag-desc"
              value={draft.description}
              placeholder="What belongs under this tag?"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.pii}
                onCheckedChange={(v) => setDraft({ ...draft, pii: Boolean(v) })}
              />
              PII / regulated
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate">Colour</Label>
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={c.key}
                  onClick={() => setDraft({ ...draft, color: c.key })}
                  className={cn(
                    "h-5 w-5 rounded-full",
                    c.swatch,
                    draft.color === c.key ? "ring-2 ring-ink ring-offset-2" : "opacity-50",
                  )}
                />
              ))}
            </div>
            <div className="ml-auto">
              <TagChip tag={preview} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <AudiencePicker
              value={draft.audience}
              users={users}
              onChange={(audience) => setDraft({ ...draft, audience })}
            />
          </div>

          <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
            <span className="font-medium text-ink">{audienceSummary(preview, users)}</span>
            <span className="text-slate"> · {audienceCount(preview, users)} of {users.length} people</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {editingTag ? "Save tag" : "Create tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
