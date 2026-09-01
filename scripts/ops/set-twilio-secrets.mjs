/**
 * Push Twilio + webhook URL secrets to Supabase Edge Functions.
 * Reads from .env — run after Nate sends credentials.
 *
 * Usage: node scripts/ops/set-twilio-secrets.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const webhookUrl =
  process.env.PUBLIC_WEBHOOK_URL?.trim() ||
  `https://${PROJECT_REF}.supabase.co/functions/v1/whatsapp-webhook`;

const pairs = [];
if (process.env.TWILIO_ACCOUNT_SID?.trim()) {
  pairs.push(`TWILIO_ACCOUNT_SID=${process.env.TWILIO_ACCOUNT_SID.trim()}`);
}
if (process.env.TWILIO_AUTH_TOKEN?.trim()) {
  pairs.push(`TWILIO_AUTH_TOKEN=${process.env.TWILIO_AUTH_TOKEN.trim()}`);
}
if (process.env.TWILIO_WHATSAPP_NUMBER?.trim()) {
  pairs.push(`TWILIO_WHATSAPP_NUMBER=${process.env.TWILIO_WHATSAPP_NUMBER.trim()}`);
}
pairs.push(`PUBLIC_WEBHOOK_URL=${webhookUrl}`);

if (pairs.length === 1) {
  console.log("No TWILIO_* keys in .env yet — will set PUBLIC_WEBHOOK_URL only.");
}

console.log("Setting Edge secrets on project", PROJECT_REF);
console.log("  PUBLIC_WEBHOOK_URL =", webhookUrl);

try {
  execSync(`npx supabase secrets set --project-ref ${PROJECT_REF} ${pairs.join(" ")}`, {
    encoding: "utf8",
    stdio: "inherit",
  });
  console.log("Done. Redeploy whatsapp-webhook if it was already live:");
  console.log(`  npx supabase functions deploy whatsapp-webhook --project-ref ${PROJECT_REF}`);
} catch (e) {
  console.error("Could not set secrets — log into Supabase CLI on the ProDG org.");
  console.error(String(e.message || e));
  process.exit(1);
}
