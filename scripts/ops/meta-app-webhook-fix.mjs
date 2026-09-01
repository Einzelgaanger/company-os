/**
 * Point Meta App webhook (messages field) at Supabase — fixes silent inbound.
 * The WABA override alone is not enough; app subscriptions were still on api.dr.vgg.app.
 *
 * Usage: node scripts/ops/meta-app-webhook-fix.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const appId = process.env.WHATSAPP_APP_ID?.trim();
const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
const callbackUri =
  process.env.PUBLIC_WEBHOOK_URL?.trim() ||
  "https://pkxnfkubgpbdbftvtgvf.supabase.co/functions/v1/whatsapp-webhook";

if (!appId || !appSecret || !verifyToken) {
  console.error("Need WHATSAPP_APP_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN");
  process.exit(1);
}

const appToken = `${appId}|${appSecret}`;

// Update whatsapp_business_account subscription → Supabase + messages field
const body = new URLSearchParams({
  object: "whatsapp_business_account",
  callback_url: callbackUri,
  verify_token: verifyToken,
  fields: "messages",
  access_token: appToken,
});

const res = await fetch(`https://graph.facebook.com/v23.0/${appId}/subscriptions`, {
  method: "POST",
  body,
});
const text = await res.text();
console.log("POST app subscriptions →", callbackUri);
console.log("Status:", res.status, res.statusText);
console.log(text);

if (!res.ok) process.exit(1);

// Re-run WABA subscribe with override (belt and braces)
const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
const userToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
if (wabaId && userToken) {
  const wabaBody = new URLSearchParams({
    override_callback_uri: callbackUri,
    verify_token: verifyToken,
    access_token: userToken,
  });
  const wabaRes = await fetch(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`, {
    method: "POST",
    body: wabaBody,
  });
  console.log("\nWABA subscribed_apps:", wabaRes.status, await wabaRes.text());
}

console.log("\nDone. Send another WhatsApp message to +44 7822 000563 to test.");
