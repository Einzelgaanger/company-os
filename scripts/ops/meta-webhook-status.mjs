/** Meta webhook delivery diagnostics. Usage: node scripts/ops/meta-webhook-status.mjs */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const wabaId = process.env.WHATSAPP_WABA_ID;
const phoneId = process.env.WHATSAPP_PHONE_ID;
const appId = process.env.WHATSAPP_APP_ID;
const appSecret = process.env.WHATSAPP_APP_SECRET;
const userToken = process.env.WHATSAPP_ACCESS_TOKEN;
const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

async function get(label, url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  console.log(`\n=== ${label} (${res.status}) ===`);
  console.log(JSON.stringify(j, null, 2).slice(0, 1200));
  return j;
}

if (wabaId && userToken) {
  await get("WABA subscribed_apps", `https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`, userToken);
}

if (phoneId && userToken) {
  await get(
    "Phone webhook_configuration",
    `https://graph.facebook.com/v23.0/${phoneId}?fields=display_phone_number,verified_name,webhook_configuration,status`,
    userToken,
  );
}

if (appId && appToken) {
  await get("App subscriptions", `https://graph.facebook.com/v23.0/${appId}/subscriptions`, appToken);
}
