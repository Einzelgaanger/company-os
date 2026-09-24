/**
 * Push Google OAuth + encryption secrets to Supabase Edge (Company OS production).
 * Uses --env-file — never pass secrets on the command line.
 *
 * Required in .env:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Strongly recommended (avoids rotating production keys):
 *   TOKEN_ENCRYPTION_KEY
 *   OAUTH_STATE_SECRET
 *
 * Optional:
 *   RESEND_API_KEY
 *   REPORT_FROM_ADDRESS
 *   PUBLIC_APP_URL
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error("Missing Google OAuth values in .env:");
  if (!clientId) console.error("  GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) console.error("  GOOGLE_OAUTH_CLIENT_SECRET");
  process.exit(1);
}

const tokenKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
const stateSecret = process.env.OAUTH_STATE_SECRET?.trim();
if (!tokenKey || !stateSecret) {
  console.warn(
    "WARN: TOKEN_ENCRYPTION_KEY and/or OAUTH_STATE_SECRET missing from .env.",
  );
  console.warn(
    "      New random values will be generated — only OK on first bootstrap.",
  );
}

/** @type {Record<string, string>} */
const secrets = {
  GOOGLE_OAUTH_CLIENT_ID: clientId,
  GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
  TOKEN_ENCRYPTION_KEY: tokenKey || randomBytes(32).toString("hex"),
  OAUTH_STATE_SECRET: stateSecret || randomBytes(32).toString("hex"),
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL?.trim() || "https://os.jabali.studio",
};
const resend = process.env.RESEND_API_KEY?.trim();
const from = process.env.REPORT_FROM_ADDRESS?.trim();
if (resend) secrets.RESEND_API_KEY = resend;
if (from) secrets.REPORT_FROM_ADDRESS = from;

const tmp = join(tmpdir(), `loop-oauth-${Date.now()}.env`);
writeFileSync(
  tmp,
  Object.entries(secrets)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  "utf8",
);

console.log("Setting Edge secrets on", PROJECT_REF);
console.log("  GOOGLE_OAUTH_CLIENT_ID =", clientId.slice(0, 12) + "…");
console.log("  GOOGLE_OAUTH_CLIENT_SECRET = set");
console.log("  TOKEN_ENCRYPTION_KEY =", tokenKey ? "from .env" : "generated (first-time only)");
console.log("  OAUTH_STATE_SECRET =", stateSecret ? "from .env" : "generated (first-time only)");
console.log("  RESEND_API_KEY =", resend ? "set" : "missing");
console.log("\nGoogle Cloud → authorized redirect URI:");
console.log(`  https://${PROJECT_REF}.supabase.co/functions/v1/oauth`);

try {
  execSync(`npx supabase secrets set --project-ref ${PROJECT_REF} --env-file "${tmp}"`, {
    stdio: "inherit",
    shell: true,
  });
  console.log("\nRedeploy: npx supabase functions deploy oauth invite --project-ref", PROJECT_REF);
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}
