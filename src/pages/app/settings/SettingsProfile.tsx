import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";

export default function SettingsProfile() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);
  const [digest, setDigest] = useState(true);
  const [phoneChanged, setPhoneChanged] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone_number ?? "");
      setWhatsapp(user.notification_prefs.whatsapp_checkins);
      setDigest(user.notification_prefs.daily_digest !== false);
    }
  }, [user]);

  if (!user) return null;

  async function save() {
    if (!user) return;
    const patch: Parameters<typeof db.updateUser>[1] = {
      full_name: fullName.trim(),
      phone_number: phone.trim() || null,
      notification_prefs: { whatsapp_checkins: whatsapp, daily_digest: digest },
    };
    if (phoneChanged) {
      patch.phone_verified_at = null; // re-verify required
    }
    await db.updateUser(user.id, patch);
    await refresh();
    toast("Saved.", "success");
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal details and how Loop reaches you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user.email} readOnly className="opacity-70" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone number</Label>
            <div className="flex items-center gap-3">
              <Input
                className="font-mono"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneChanged(true);
                }}
              />
              {user.phone_verified_at && !phoneChanged ? (
                <span className="whitespace-nowrap text-sm text-green">Verified</span>
              ) : (
                <span className="whitespace-nowrap text-sm text-slate">Not verified</span>
              )}
            </div>
            <p className="text-xs text-slate">
              Loop verifies numbers by sending a WhatsApp code when messaging is live for your organization.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">WhatsApp check-ins</div>
              <div className="text-sm text-slate">Let Loop message you to track your commitments.</div>
            </div>
            <Switch checked={whatsapp} onCheckedChange={setWhatsapp} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">Morning digest</div>
              <div className="text-sm text-slate">Daily summary of overdue, due today, and upcoming items.</div>
            </div>
            <Switch checked={digest} onCheckedChange={setDigest} />
          </div>
          {!whatsapp && (
            <p className="rounded-md border border-amber/30 bg-amber/5 p-3 text-sm text-amber">
              With check-ins off, Loop can't track your commitments.
            </p>
          )}
        </CardContent>
      </Card>

      <Button onClick={save}>Save changes</Button>
    </>
  );
}
