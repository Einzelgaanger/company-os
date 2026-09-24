import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { isMockMode, supabase } from "@/lib/supabase";
import {
  channelReady,
  preferredChannel,
  preferredChannelLabel,
} from "@/lib/messaging";
import type { PreferredMessagingChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNELS: {
  id: PreferredMessagingChannel;
  title: string;
  blurb: string;
}[] = [
  {
    id: "in_app",
    title: "In-app Chat",
    blurb: "Use the Chat tab in Company OS. Works now — no Telegram or WhatsApp required.",
  },
  {
    id: "telegram",
    title: "Telegram",
    blurb: "Bot messages you on Telegram. Same thread still appears in Chat.",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    blurb: "Bot messages you on WhatsApp when Meta/Twilio is live. Until then, delivery stays in Chat.",
  },
];

export default function SettingsProfile() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkinsOn, setCheckinsOn] = useState(true);
  const [digest, setDigest] = useState(true);
  const [channel, setChannel] = useState<PreferredMessagingChannel>("in_app");
  const [phoneChanged, setPhoneChanged] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone_number ?? "");
      setCheckinsOn(user.notification_prefs.whatsapp_checkins);
      setDigest(user.notification_prefs.daily_digest !== false);
      setChannel(preferredChannel(user));
    }
  }, [user]);

  if (!user) return null;

  const telegramOk = channelReady(user, "telegram");
  const whatsappOk = channelReady(user, "whatsapp");

  async function save() {
    if (!user) return;
    const patch: Parameters<typeof db.updateUser>[1] = {
      full_name: fullName.trim(),
      phone_number: phone.trim() || null,
      notification_prefs: {
        whatsapp_checkins: checkinsOn,
        daily_digest: digest,
        preferred_channel: channel,
      },
    };
    if (phoneChanged) {
      patch.phone_verified_at = null;
    }
    await db.updateUser(user.id, patch);
    await refresh();
    toast("Saved.", "success");
  }

  async function sendOtp() {
    if (!user) return;
    if (isMockMode || !supabase) {
      toast("OTP needs a live Supabase deployment. Use In-app Chat for now.", "default");
      return;
    }
    setOtpBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { action: "send", user_id: user.id },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setOtpSent(true);
      toast(`Code sent via ${(data as { channel?: string }).channel ?? "messaging"}.`, "success");
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : "Could not send OTP. Save your phone first, or use In-app Chat.",
        "error",
      );
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtp() {
    if (!user || !otpCode.trim()) return;
    if (isMockMode || !supabase) {
      toast("OTP needs a live Supabase deployment.", "default");
      return;
    }
    setOtpBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { action: "verify", user_id: user.id, code: otpCode.trim() },
      });
      if (error) throw error;
      if (!(data as { verified?: boolean })?.verified) {
        throw new Error((data as { error?: string })?.error ?? "Invalid code");
      }
      await refresh();
      toast("Phone verified for WhatsApp.", "success");
      setOtpSent(false);
      setOtpCode("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Verification failed.", "error");
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal details and how Company OS reaches you.</CardDescription>
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
                placeholder="+254…"
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
              Needed to link Telegram (<span className="font-mono">LINK +phone</span>) and for WhatsApp when live.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferred messaging channel</CardTitle>
          <CardDescription>
            Pick one. Teammates can choose differently. Every message still appears in{" "}
            <Link to="/chat" className="underline-offset-2 hover:underline">
              Chat
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNELS.map((c) => {
            const selected = channel === c.id;
            const ready =
              c.id === "in_app" ? true : c.id === "telegram" ? telegramOk : whatsappOk;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition",
                  selected
                    ? "border-[#0E1F1A] bg-[#0E1F1A]/[0.04]"
                    : "border-[rgba(14,31,26,0.12)] hover:border-[rgba(14,31,26,0.25)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#0E1F1A]">{c.title}</span>
                  <div className="flex items-center gap-2">
                    {ready ? (
                      <Badge variant="green">Ready</Badge>
                    ) : (
                      <Badge variant="outline">Not linked</Badge>
                    )}
                    {selected && <Badge variant="outline">Selected</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-xs text-[#5B6560]">{c.blurb}</p>
              </button>
            );
          })}

          <div className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-[color:var(--brand-on-forest)] p-3 text-xs text-slate">
            <p className="font-medium text-[#0E1F1A]">Connect Telegram</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Save your phone number above (E.164, e.g. +254…).</li>
              <li>
                Open your Company OS Telegram bot and send{" "}
                <span className="font-mono text-[#0E1F1A]">LINK {phone.trim() || "+yourphone"}</span>
              </li>
              <li>Select Telegram as preferred and Save.</li>
            </ol>
            {telegramOk && (
              <p className="mt-2 text-green">
                Telegram linked
                {user.telegram_username ? ` (@${user.telegram_username})` : ""}.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-[color:var(--brand-on-forest)] p-3 text-xs text-slate">
            <p className="font-medium text-[#0E1F1A]">Connect WhatsApp</p>
            <p className="mt-1">
              Save phone, then verify with OTP when WhatsApp messaging is configured. If Meta is not live yet,
              keep using In-app Chat — UI is ready for when it is.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={otpBusy || !phone.trim()}
                onClick={() => void sendOtp()}
              >
                Send OTP
              </Button>
              {otpSent && (
                <>
                  <Input
                    className="h-8 w-28 font-mono"
                    placeholder="6-digit"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={otpBusy || !otpCode.trim()}
                    onClick={() => void verifyOtp()}
                  >
                    Verify
                  </Button>
                </>
              )}
              {whatsappOk && <Badge variant="green">WhatsApp verified</Badge>}
            </div>
          </div>

          {channel !== "in_app" && !channelReady(user, channel) && (
            <p className="rounded-md border border-amber/30 bg-amber/5 p-3 text-sm text-amber">
              You selected {preferredChannelLabel(channel)} but it is not linked yet. Until you connect it,
              Company OS will deliver in Chat.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">Allow Company OS check-ins</div>
              <div className="text-sm text-slate">
                Master switch for outbound pings on your preferred channel (and Chat).
              </div>
            </div>
            <Switch checked={checkinsOn} onCheckedChange={setCheckinsOn} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-ink">Morning digest</div>
              <div className="text-sm text-slate">Daily summary of overdue, due today, and upcoming items.</div>
            </div>
            <Switch checked={digest} onCheckedChange={setDigest} />
          </div>
          {!checkinsOn && (
            <p className="rounded-md border border-amber/30 bg-amber/5 p-3 text-sm text-amber">
              With check-ins off, Company OS won&apos;t ping you about commitments.
            </p>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => void save()}>Save changes</Button>
    </>
  );
}
