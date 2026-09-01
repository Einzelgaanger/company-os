/**
 * Register Loop webhook on the WABA (Nate's curl step).
 * Usage: node scripts/ops/meta-webhook-subscribe.mjs
 */
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

const wabaId =
  process.env.WHATSAPP_WABA_ID?.trim() ||
  process.env.META_WABA_ID?.trim();
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
const callbackUri =
  process.env.PUBLIC_WEBHOOK_URL?.trim() ||
  "https://pkxnfkubgpbdbftvtgvf.supabase.co/functions/v1/whatsapp-webhook";

if (!wabaId || !accessToken || !verifyToken) {
  console.error("Need WHATSAPP_WABA_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN in .env");
  process.exit(1);
}

const url = `https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`;
const body = new URLSearchParams({
  override_callback_uri: callbackUri,
  verify_token: verifyToken,
  access_token: accessToken,
});

const res = await fetch(url, { method: "POST", body });
const text = await res.text();
console.log("POST", url);
console.log("Status:", res.status, res.statusText);
console.log(text.slice(0, 500));

if (!res.ok) process.exit(1);
console.log("\nMeta webhook subscription OK — tell Nate verify token is live on Supabase.");
