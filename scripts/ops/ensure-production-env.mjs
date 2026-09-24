/**
 * Adds missing production keys to `.env` without overwriting values you already set.
 * Safe to run repeatedly before go-live.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const REF = "pkxnfkubgpbdbftvtgvf";
const SITE = "https://os.jabali.studio";
const envPath = resolve(process.cwd(), ".env");

if (!existsSync(envPath)) {
  console.error("No .env — copy .env.example to .env first.");
  process.exit(1);
}

const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const have = new Set();
for (const line of lines) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (m) have.add(m[1]);
}

const get = (key) => {
  for (const line of lines) {
    const m = line.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  }
  return "";
};

/** @type {Record<string, string>} */
const defaults = {
  SUPABASE_PROJECT_REF: REF,
  SUPABASE_URL: `https://${REF}.supabase.co`,
  PUBLIC_APP_URL: SITE,
  VITE_PUBLIC_SITE_URL: SITE,
  MESSAGING_MODE: "live",
  FEATURE_EMAIL_INGESTION: "true",
  FEATURE_WHATSAPP_MANUAL_APPROVE: "false",
  REPORT_FROM_ADDRESS: "Company OS <noreply@prodg.studio>",
  PUBLIC_WEBHOOK_URL: `https://${REF}.supabase.co/functions/v1/whatsapp-webhook`,
  PUBLIC_TELEGRAM_WEBHOOK_URL: `https://${REF}.supabase.co/functions/v1/telegram-webhook`,
  WEBHOOKS_PUBLIC_URL: `https://${REF}.supabase.co/functions/v1`,
  MICROSOFT_TENANT_ID: "common",
};

if (get("WHATSAPP_PHONE_ID") && !get("WHATSAPP_PHONE_NUMBER_ID")) {
  defaults.WHATSAPP_PHONE_NUMBER_ID = get("WHATSAPP_PHONE_ID");
}
if (get("WHATSAPP_WABA_ID") && !get("META_WABA_ID")) {
  defaults.META_WABA_ID = get("WHATSAPP_WABA_ID");
  defaults.WHATSAPP_WABA_ID = get("WHATSAPP_WABA_ID");
}

if (!get("TOKEN_ENCRYPTION_KEY")) {
  defaults.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
}
if (!get("OAUTH_STATE_SECRET")) {
  defaults.OAUTH_STATE_SECRET = randomBytes(32).toString("hex");
}

const added = [];
for (const [key, value] of Object.entries(defaults)) {
  if (have.has(key)) continue;
  lines.push(`${key}=${value}`);
  added.push(key);
}

// Production SPA: clear mock/local API hijacks (comment preserved values in file header)
let body = lines.join("\n");
if (/\nVITE_ALLOW_MOCK=1/.test(body)) {
  body = body.replace(/\nVITE_ALLOW_MOCK=1/, "\n# VITE_ALLOW_MOCK=1   # removed for production — unset on Render too");
}
if (/\nVITE_API_URL=http:\/\/127\.0\.0\.1:3001/.test(body)) {
  body = body.replace(
    /\nVITE_API_URL=http:\/\/127\.0\.0\.1:3001/,
    "\n# VITE_API_URL=       # leave empty in production (Supabase data plane)",
  );
}
if (/\nPUBLIC_APP_URL=http:\/\/localhost:5173/.test(body)) {
  body = body.replace(/\nPUBLIC_APP_URL=http:\/\/localhost:5173/, `\nPUBLIC_APP_URL=${SITE}`);
}

writeFileSync(envPath, body.endsWith("\n") ? body : body + "\n", "utf8");

console.log("ensure-production-env: updated", envPath);
if (added.length) console.log("  added:", added.join(", "));
else console.log("  no new keys (already complete)");
console.log("\nNext: npm run ops:production-secrets");
