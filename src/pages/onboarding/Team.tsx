import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { Role } from "@/lib/types";

interface Row {
  email: string;
  role: Role;
}

export default function OnbTeam() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([{ email: "", role: "member" }]);

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function sendInvites() {
    if (!user) return;
    const valid = rows.filter((r) => r.email.includes("@"));
    for (const r of valid) {
      await db.inviteUser(user, r.email.trim(), r.role, null);
    }
    if (valid.length) toast(`${valid.length} invite${valid.length > 1 ? "s" : ""} created.`, "success");
    navigate("/onboarding/complete");
  }

  return (
    <OnboardingLayout
      step={4}
      title="Invite your team"
      description="Add teammates now, or invite them later from Settings."
      footer={
        <Button variant="ghost" onClick={() => navigate("/onboarding/complete")}>
          Skip for now
        </Button>
      }
    >
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input
              className="flex-1"
              type="email"
              placeholder="teammate@company.com"
              value={row.email}
              onChange={(e) => update(i, { email: e.target.value })}
            />
            <div className="w-36">
              <Select value={row.role} onValueChange={(v) => update(i, { role: v as Role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              disabled={rows.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { email: "", role: "member" }])}>
          <Plus className="h-4 w-4" /> Add row
        </Button>
      </div>
      <div className="mt-6">
        <Button onClick={sendInvites}>Send invites</Button>
      </div>
    </OnboardingLayout>
  );
}
