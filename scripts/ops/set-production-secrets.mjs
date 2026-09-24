/**
 * Push every non-empty production secret from `.env` to Supabase Edge (one shot).
 * Uses --env-file so nothing lands in shell history.
 *
 *   npm run ops:ensure-env
 *   npm run ops:production-secrets
 */
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";

/** Every key Edge functions may read (env or getSecret). Omit auto-injected Supabase keys. */
const EDGE_KEYS = [
  "PUBLIC_APP_URL",
  "MESSAGING_MODE",
  "FEATURE_EMAIL_INGESTION",
  "FEATURE_WHATSAPP_MANUAL_APPROVE",
  "TOKEN_ENCRYPTION_KEY",
  "OAUTH_STATE_SECRET",
  "KMS_KEY_ID",
  "RESEND_API_KEY",
  "REPORT_FROM_ADDRESS",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "MICROSOFT_OAUTH_CLIENT_ID",
  "MICROSOFT_OAUTH_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "ATLASSIAN_OAUTH_CLIENT_ID",
  "ATLASSIAN_OAUTH_CLIENT_SECRET",
  "SLACK_OAUTH_CLIENT_ID",
  "SLACK_OAUTH_CLIENT_SECRET",
  "DISCORD_OAUTH_CLIENT_ID",
  "DISCORD_OAUTH_CLIENT_SECRET",
  "ZOOM_OAUTH_CLIENT_ID",
  "ZOOM_OAUTH_CLIENT_SECRET",
  "WEBEX_OAUTH_CLIENT_ID",
  "WEBEX_OAUTH_CLIENT_SECRET",
  "FRONT_OAUTH_CLIENT_ID",
  "FRONT_OAUTH_CLIENT_SECRET",
  "CALENDLY_OAUTH_CLIENT_ID",
  "CALENDLY_OAUTH_CLIENT_SECRET",
  "NOTION_OAUTH_CLIENT_ID",
  "NOTION_OAUTH_CLIENT_SECRET",
  "HUBSPOT_OAUTH_CLIENT_ID",
  "HUBSPOT_OAUTH_CLIENT_SECRET",
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_PHONE_ID",
  "META_WABA_ID",
  "WHATSAPP_WABA_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WHATSAPP_NUMBER",
  "PUBLIC_WEBHOOK_URL",
  "PUBLIC_TELEGRAM_WEBHOOK_URL",
  "FATHOM_API_KEY",
  "FATHOM_WEBHOOK_SECRET",
  "WORKOS_API_KEY",
  "WORKOS_CLIENT_ID",
  "WORKOS_WEBHOOK_SECRET",
  "SENTRY_DSN",
];

const pairs = [];
const pushed = [];
for (const key of EDGE_KEYS) {
  const v = process.env[key]?.trim();
  if (!v) continue;
  pairs.push(`${key}=${v}`);
  pushed.push(key);
}

if (pairs.length === 0) {
  console.error("Nothing to push — fill .env then run npm run ops:ensure-env");
  process.exit(1);
}

const tmp = join(tmpdir(), `loop-production-${Date.now()}.env`);
writeFileSync(tmp, pairs.join("\n") + "\n", "utf8");

console.log(`Pushing ${pushed.length} secrets to ${PROJECT_REF}…`);
console.log("  includes:", pushed.slice(0, 12).join(", "), pushed.length > 12 ? "…" : "");

try {
  execSync(`npx supabase secrets set --project-ref ${PROJECT_REF} --env-file "${tmp}"`, {
    stdio: "inherit",
    shell: true,
  });
  console.log("\nRedeploy functions that read new flags:");
  console.log(
    "  npx supabase functions deploy oauth invite email-dispatch send-checkin launch-readiness --project-ref",
    PROJECT_REF,
  );
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}
