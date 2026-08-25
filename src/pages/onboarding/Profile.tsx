import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";

const COUNTRY_CODES = [
  { code: "+254", label: "🇰🇪 +254" },
  { code: "+234", label: "🇳🇬 +234" },
  { code: "+27", label: "🇿🇦 +27" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+1", label: "🇺🇸 +1" },
];

export default function OnbProfile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [code, setCode] = useState("+254");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const phoneNumber = phone ? `${code}${phone.replace(/^0+/, "")}` : null;
      await db.updateUser(user.id, { full_name: fullName.trim(), phone_number: phoneNumber });
      await refresh();
      navigate("/onboarding/connections");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout step={2} title="Your profile" description="Loop reaches you on WhatsApp for check-ins.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullname">Full name</Label>
          <Input id="fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Phone number</Label>
          <div className="flex gap-2">
            <div className="w-32">
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              className="flex-1 font-mono"
              inputMode="tel"
              placeholder="712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </OnboardingLayout>
  );
}
