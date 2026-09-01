/**
 * Push WhatsApp secrets to Supabase Edge Functions (Meta Cloud API and/or Twilio).
 * Accepts Nate/Doppler names (WHATSAPP_PHONE_ID, WHATSAPP_WABA_ID) and canonical names.
 *
 * Usage: node scripts/ops/set-whatsapp-secrets.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

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

const verifyToken =
  process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
  `loop-verify-${randomBytes(8).toString("hex")}`;

const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const phoneNumberId =
  process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || process.env.WHATSAPP_PHONE_ID?.trim();
const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
const wabaId = process.env.META_WABA_ID?.trim() || process.env.WHATSAPP_WABA_ID?.trim();

/** @type {Record<string, string>} */
const secrets = {
  PUBLIC_WEBHOOK_URL: webhookUrl,
  WHATSAPP_VERIFY_TOKEN: verifyToken,
};
if (accessToken) secrets.WHATSAPP_ACCESS_TOKEN = accessToken;
if (phoneNumberId) {
  secrets.WHATSAPP_PHONE_NUMBER_ID = phoneNumberId;
  secrets.WHATSAPP_PHONE_ID = phoneNumberId;
}
if (appSecret) secrets.WHATSAPP_APP_SECRET = appSecret;
if (wabaId) {
  secrets.META_WABA_ID = wabaId;
  secrets.WHATSAPP_WABA_ID = wabaId;
}

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_NUMBER"]) {
  if (process.env[key]?.trim()) secrets[key] = process.env[key].trim();
}

console.log("Setting Edge secrets on project", PROJECT_REF);
console.log("  PUBLIC_WEBHOOK_URL =", webhookUrl);
console.log("  WHATSAPP_VERIFY_TOKEN =", verifyToken.slice(0, 8) + "…");
console.log("  WHATSAPP_ACCESS_TOKEN =", accessToken ? "set" : "MISSING");
console.log("  WHATSAPP_PHONE_NUMBER_ID =", phoneNumberId ?? "MISSING");
console.log("  WHATSAPP_APP_SECRET =", appSecret ? "set" : "MISSING");
console.log("  META_WABA_ID =", wabaId ?? "(optional)");

if (!accessToken || !phoneNumberId || !appSecret) {
  console.error("\nMissing required Meta vars in .env:");
  if (!accessToken) console.error("  - WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) console.error("  - WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_PHONE_ID");
  if (!appSecret) console.error("  - WHATSAPP_APP_SECRET");
  process.exit(1);
}

const args = Object.entries(secrets)
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  .join(" ");

try {
  execSync(`npx supabase secrets set --project-ref ${PROJECT_REF} ${args}`, {
    encoding: "utf8",
    stdio: "inherit",
    shell: true,
  });
  console.log("\nDone. Redeploy edge functions:");
  console.log(
    `  npx supabase functions deploy whatsapp-webhook send-checkin verify-otp escalate --project-ref ${PROJECT_REF}`,
  );
} catch (e) {
  console.error("Could not set secrets — run: npx supabase login");
  console.error(String(e.message || e));
  process.exit(1);
}
