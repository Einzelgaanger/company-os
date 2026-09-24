import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { Role } from "@/lib/types";

export function InviteDialog({ onInvited }: { onInvited?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);

  async function invite() {
    if (!user || !email.includes("@")) return;
    setBusy(true);
    try {
      const result = await db.inviteUser(user, email.trim(), role, null);
      if (result.invite_url && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.invite_url).catch(() => undefined);
      }
      toast(
        result.emailed
          ? `Invite emailed to ${email}. Link also copied.`
          : `Invite created for ${email}. Link copied — email delivery is not configured yet.`,
        "success",
      );
      setOpen(false);
      setEmail("");
      onInvited?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "invite_failed";
      toast(
        msg === "already_a_member" ? "That person is already in this workspace." : msg,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                {user?.role === "owner" ? <SelectItem value="admin">Admin</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void invite()} disabled={!email.includes("@") || busy}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
