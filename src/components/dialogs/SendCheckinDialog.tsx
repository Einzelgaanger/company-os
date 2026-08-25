import { useState } from "react";
import { Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { User } from "@/lib/types";

export function SendCheckinDialog({
  users,
  presetUserId,
  commitmentId = null,
  commitmentTitle,
  onSent,
  trigger,
}: {
  users: User[];
  presetUserId?: string;
  commitmentId?: string | null;
  commitmentTitle?: string;
  onSent?: () => void;
  trigger?: React.ReactNode;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(presetUserId ?? "");
  const [text, setText] = useState(
    commitmentTitle ? `Hi, quick check on "${commitmentTitle}" — how's it going, and anything blocking you?` : ""
  );
  const [busy, setBusy] = useState(false);

  const eligible = users.filter((u) => u.status === "active");

  async function send() {
    if (!user || !target) return;
    setBusy(true);
    try {
      await db.sendCheckin(user, target, commitmentId, text.trim() || "Quick check-in — how's it going?");
      const name = users.find((u) => u.id === target)?.full_name ?? "them";
      toast(`Check-in queued for ${name}.`, "success");
      setOpen(false);
      onSent?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Send className="h-4 w-4" /> Send check-in now
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a check-in now</DialogTitle>
          <DialogDescription>
            Loop will message this person on WhatsApp out of the normal cycle.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!presetUserId && (
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                      {!u.phone_verified_at ? " (WhatsApp not verified)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !target}>
            {busy ? "Sending…" : "Send check-in now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
