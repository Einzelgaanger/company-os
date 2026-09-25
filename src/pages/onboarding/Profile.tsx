import { useEffect, useState } from "react";
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

function splitPhone(value: string | null | undefined) {
  if (!value) return { code: "+254", local: "" };
  const match = COUNTRY_CODES.find((c) => value.startsWith(c.code));
  if (!match) return { code: "+254", local: value.replace(/^\+/, "") };
  return { code: match.code, local: value.slice(match.code.length) };
}

export default function OnbProfile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [code, setCode] = useState("+254");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    const split = splitPhone(user.phone_number);
    setCode(split.code);
    setPhone(split.local);
  }, [user?.id, user?.full_name, user?.phone_number]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const phoneNumber = phone.trim()
        ? `${code}${phone.replace(/^0+/, "")}`
        : user.phone_number;
      await db.updateUser(user.id, { full_name: fullName.trim(), phone_number: phoneNumber });
      await refresh();
      navigate("/onboarding/connections");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout step={3} title="Your profile" description="Company OS reaches you in Chat, or on Telegram once it is linked.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullname">Full name</Label>
          <Input id="fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Phone number</Label>
          {user?.phone_number ? (
            <p className="text-sm text-[#0E1F1A]">
              Already saved on this account as <span className="font-semibold">{user.phone_number}</span>. Same Google sign-in on another device keeps it. Change it only if it is wrong.
            </p>
          ) : (
            <p className="text-xs text-slate">Optional. Add it if you want Telegram or WhatsApp later.</p>
          )}
          <div className="flex flex-col gap-2 min-[480px]:flex-row">
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
