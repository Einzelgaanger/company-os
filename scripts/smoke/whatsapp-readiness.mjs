/**
 * WhatsApp integration readiness — Meta Cloud API and/or Twilio.
 * Usage: node scripts/smoke/whatsapp-readiness.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const url = process.env.VITE_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookUrl =
  process.env.PUBLIC_WEBHOOK_URL?.trim() ||
  `${url}/functions/v1/whatsapp-webhook`;

const results = [];
function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}
function warn(name, detail) {
  console.log(`WARN  ${name} — ${detail}`);
}

async function main() {
  console.log("Loop WhatsApp readiness\n");

  if (!service) {
    fail("env.service_role", "SUPABASE_SERVICE_ROLE_KEY missing");
    process.exit(1);
  }
  ok("env.supabase_url", url);
  ok("env.webhook_url", webhookUrl);

  const metaReady = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      (process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || process.env.WHATSAPP_PHONE_ID?.trim()) &&
      process.env.WHATSAPP_APP_SECRET?.trim(),
  );
  const twilioReady = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_NUMBER?.trim(),
  );

  if (metaReady) ok("env.meta", "WHATSAPP_ACCESS_TOKEN + PHONE_NUMBER_ID + APP_SECRET set");
  else
    warn(
      "env.meta",
      "Meta Cloud API vars empty — set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET",
    );

  if (twilioReady) ok("env.twilio", "TWILIO_* set (fallback provider)");
  else if (!metaReady) warn("env.provider", "No live provider in .env — outbound stays in_app");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (verifyToken) ok("env.verify_token", "WHATSAPP_VERIFY_TOKEN set for Meta webhook registration");
  else warn("env.verify_token", "WHATSAPP_VERIFY_TOKEN not in .env — run npm run ops:whatsapp-secrets");

  // Meta GET verify handshake (403 without matching token is OK if token not on Edge yet)
  try {
    const getUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken || "probe")}&hub.challenge=12345`;
    const getRes = await fetch(getUrl, { method: "GET" });
    if (getRes.status === 200 && (await getRes.text()) === "12345") {
      ok("edge.meta_verify", "GET handshake returns challenge");
    } else if (getRes.status === 403) {
      ok("edge.meta_verify", "GET reachable (403 until verify token synced to Edge)");
    } else {
      fail("edge.meta_verify", `unexpected HTTP ${getRes.status}`);
    }
  } catch (e) {
    fail("edge.meta_verify", String(e.message || e));
  }

  // Meta JSON POST (unsigned → 403 or 503)
  try {
    const jsonRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    });
    if (jsonRes.status === 403) ok("edge.meta_webhook", "JSON POST deployed (403 without signature)");
    else if (jsonRes.status === 503) ok("edge.meta_webhook", "JSON POST deployed (503 — Meta secrets pending on Edge)");
    else fail("edge.meta_webhook", `unexpected HTTP ${jsonRes.status}`);
  } catch (e) {
    fail("edge.meta_webhook", String(e.message || e));
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error: uErr } = await admin
    .from("users")
    .select("id,full_name,phone_number,phone_verified_at,notification_prefs")
    .not("phone_number", "is", null);
  if (uErr) fail("db.users_phones", uErr.message);
  else {
    const verified = (users ?? []).filter((u) => u.phone_verified_at).length;
    ok("db.users_phones", `${users?.length ?? 0} with phone, ${verified} verified`);
    for (const u of users ?? []) {
      console.log(`      · ${u.full_name}: ${u.phone_number}${u.phone_verified_at ? " ✓" : " (unverified)"}`);
    }
  }

  const { data: ck, error: ckErr } = await admin.functions.invoke("send-checkin", {
    body: { user_id: users?.[0]?.id, text: "WhatsApp readiness probe." },
  });
  if (ckErr) fail("edge.send-checkin", ckErr.message);
  else {
    const channel = ck?.channel ?? "?";
    if (channel === "whatsapp") ok("edge.send-checkin", "live WhatsApp channel");
    else ok("edge.send-checkin", `channel=${channel} (expected until Meta/Twilio on Edge)`);
  }

  console.log("\n--- For Nate (Meta Developer Console → WhatsApp → Configuration) ---");
  console.log("Callback URL:", webhookUrl);
  console.log("Verify token:  ", verifyToken || "(run npm run ops:whatsapp-secrets to generate)");
  console.log("Subscribe to:  messages\n");

  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
