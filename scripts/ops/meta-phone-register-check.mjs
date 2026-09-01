/** Check if WhatsApp phone is registered with Meta. Usage: node scripts/ops/meta-phone-register-check.mjs */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const phoneId = process.env.WHATSAPP_PHONE_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;

const fields =
  "display_phone_number,verified_name,status,platform_type,code_verification_status,is_official_business_account,quality_rating,webhook_configuration";
const res = await fetch(`https://graph.facebook.com/v23.0/${phoneId}?fields=${fields}`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log(JSON.stringify(await res.json(), null, 2));

// Try register status — deregistered numbers won't receive webhooks properly
const regRes = await fetch(`https://graph.facebook.com/v23.0/${phoneId}?fields=status`, {
  headers: { Authorization: `Bearer ${token}` },
});
const reg = await regRes.json();
console.log("\nPhone status:", reg.status ?? reg);
