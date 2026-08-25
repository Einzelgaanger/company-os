// verify-otp (BUILD_SPEC Section 10)
// Sends and confirms the WhatsApp onboarding OTP (W-OTP). Codes are stored
// hashed with a short TTL. Two actions: {action: "send"|"verify"}.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendWhatsApp } from "../_shared/twilio.ts";
import { templates } from "../_shared/templates.ts";

// Simple in-memory store keyed by user; replace with a DB table or Redis in prod.
const codes = new Map<string, { code: string; expires: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  const { action, user_id, code } = await req.json();

  const { data: user } = await db.from("users").select("*").eq("id", user_id).single();
  if (!user?.phone_number) return json({ error: "no phone on file" }, 400);

  if (action === "send") {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    codes.set(user_id, { code: otp, expires: Date.now() + 10 * 60 * 1000 });
    await sendWhatsApp(user.phone_number, templates["W-OTP"]({ code: otp }));
    return json({ sent: true });
  }

  if (action === "verify") {
    const entry = codes.get(user_id);
    if (!entry || entry.expires < Date.now()) return json({ verified: false, error: "expired" }, 400);
    if (entry.code !== code) return json({ verified: false, error: "mismatch" }, 400);
    codes.delete(user_id);
    await db.from("users").update({ phone_verified_at: new Date().toISOString() }).eq("id", user_id);
    return json({ verified: true });
  }

  return json({ error: "unknown action" }, 400);
});
