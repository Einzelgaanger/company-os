import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { User } from "@/lib/types";

export default function ReportSettings() {
  const { user, org, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "both">("daily");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [channels, setChannels] = useState({ email: true, in_app: true, whatsapp: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !org) return;
    void db.listUsers(user.org_id).then((u) => {
      setUsers(u);
      setFrequency(org.settings.report_frequency ?? "daily");
      setRecipients(org.settings.report_recipient_ids ?? u.filter((x) => ["admin", "owner"].includes(x.role)).map((x) => x.id));
      setChannels(org.settings.report_channels ?? { email: true, in_app: true, whatsapp: false });
      setLoading(false);
    });
  }, [user, org]);

  async function save() {
    if (!org) return;
    await db.updateOrg(org.id, {
      settings: {
        ...org.settings,
        report_frequency: frequency,
        report_recipient_ids: recipients,
        report_channels: channels,
      },
    });
    await refresh();
    toast("Saved.", "success");
  }

  if (loading) return <TableSkeleton />;

  function toggleRecipient(id: string) {
    setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  return (
    <div className="portal-page animate-fade-in">
      <button onClick={() => navigate("/reports")} className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Reports
      </button>
      <PageHeader title="Report settings" description="Control cadence, audience, and delivery." />

      <Card>
        <CardHeader>
          <CardTitle>Cadence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-3 text-sm">
              <Checkbox checked={recipients.includes(u.id)} onCheckedChange={() => toggleRecipient(u.id)} />
              <span className="text-ink">{u.full_name}</span>
              <span className="text-slate">{u.email}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(["email", "in_app", "whatsapp"] as const).map((ch) => (
            <label key={ch} className="flex items-center gap-3 text-sm">
              <Checkbox checked={channels[ch]} onCheckedChange={(v) => setChannels((c) => ({ ...c, [ch]: Boolean(v) }))} />
              <span className="text-ink capitalize">{ch === "in_app" ? "In-app" : ch === "whatsapp" ? "WhatsApp digest" : "Email"}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Button onClick={save}>Save changes</Button>
    </div>
  );
}
