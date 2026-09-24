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
import { channelReady, preferredChannel, preferredChannelLabel } from "@/lib/messaging";
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
  const selected = eligible.find((u) => u.id === target);
  const pref = selected ? preferredChannel(selected) : "in_app";
  const externalPending =
    selected && (pref === "telegram" || pref === "whatsapp") && !channelReady(selected, pref);

  async function send() {
    if (!user || !target) return;
    setBusy(true);
    try {
      await db.sendCheckin(user, target, commitmentId, text.trim() || "Quick check-in — how's it going?");
      const name = users.find((u) => u.id === target)?.full_name ?? "them";
      toast(
        externalPending
          ? `Check-in queued for ${name} (will deliver in Chat until ${preferredChannelLabel(pref)} is linked).`
          : `Check-in queued for ${name}.`,
        "success",
      );
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
            Delivers on each person&apos;s preferred channel (In-app Chat, Telegram, or WhatsApp). Always visible in Chat.
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
                  {eligible.map((u) => {
                    const p = preferredChannel(u);
                    const ready = channelReady(u, p);
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name} · {preferredChannelLabel(p)}
                        {!ready && p !== "in_app" ? " (not linked — Chat)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          {externalPending && (
            <p className="text-xs text-amber">
              {selected?.full_name} prefers {preferredChannelLabel(pref)} but isn&apos;t linked — this check-in will land in Chat.
            </p>
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
          <Button onClick={() => void send()} disabled={busy || !target}>
            {busy ? "Sending…" : "Send check-in now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
