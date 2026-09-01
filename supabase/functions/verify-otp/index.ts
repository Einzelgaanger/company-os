// verify-otp — WhatsApp phone verification with DB-backed hashed codes.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sendWhatsApp } from "../_shared/whatsapp.ts";
import { templates } from "../_shared/templates.ts";
import { sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function otpHash(userId: string, code: string): Promise<string> {
  return sha256Hex(`${userId}:${code}:${Deno.env.get("JWT_ACCESS_SECRET") ?? "loop-otp"}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  const { action, user_id, code } = await req.json();

  const { data: user } = await db.from("users").select("*").eq("id", user_id).single();
  if (!user?.phone_number) return json({ error: "no phone on file" }, 400);

  if (action === "send") {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await otpHash(user_id, otp);
    const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await db.from("phone_otp_codes").upsert(
      { user_id, code_hash, expires_at, attempts: 0, created_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    await sendWhatsApp(user.phone_number, templates["W-OTP"]({ code: otp }));
    return json({ sent: true });
  }

  if (action === "verify") {
    const { data: entry } = await db
      .from("phone_otp_codes")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!entry || new Date(entry.expires_at).getTime() < Date.now()) {
      return json({ verified: false, error: "expired" }, 400);
    }
    if ((entry.attempts ?? 0) >= MAX_ATTEMPTS) {
      return json({ verified: false, error: "too_many_attempts" }, 429);
    }
    const expected = entry.code_hash as string;
    const actual = await otpHash(user_id, String(code ?? ""));
    if (!timingSafeEqual(expected, actual)) {
      await db
        .from("phone_otp_codes")
        .update({ attempts: (entry.attempts ?? 0) + 1 })
        .eq("user_id", user_id);
      return json({ verified: false, error: "mismatch" }, 400);
    }
    await db.from("phone_otp_codes").delete().eq("user_id", user_id);
    await db.from("users").update({ phone_verified_at: new Date().toISOString() }).eq("id", user_id);
    return json({ verified: true });
  }

  return json({ error: "unknown action" }, 400);
});
