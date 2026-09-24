/**
 * Push Google OAuth + token-encryption secrets to the Company OS Supabase project.
 *
 * Do not paste the client secret into chat. Put it in the gitignored `.env` file:
 *
 *   GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
 *   GOOGLE_OAUTH_CLIENT_SECRET=...
 *   RESEND_API_KEY=re_...          # optional, for branded invite email
 *
 * Then: node scripts/ops/set-google-oauth-secrets.mjs
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
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
const resend = process.env.RESEND_API_KEY?.trim();
const tokenKey =
  process.env.TOKEN_ENCRYPTION_KEY?.trim() || randomBytes(32).toString("hex");
const stateSecret =
  process.env.OAUTH_STATE_SECRET?.trim() || randomBytes(32).toString("hex");

if (!clientId || !clientSecret) {
  console.error("Missing Google OAuth values in .env:");
  if (!clientId) console.error("  GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) console.error("  GOOGLE_OAUTH_CLIENT_SECRET");
  console.error("\nAdd them to .env (never commit that file), then re-run this script.");
  process.exit(1);
}

/** @type {Record<string, string>} */
const secrets = {
  GOOGLE_OAUTH_CLIENT_ID: clientId,
  GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
  TOKEN_ENCRYPTION_KEY: tokenKey,
  OAUTH_STATE_SECRET: stateSecret,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL?.trim() || "https://companyos.jabali.studio",
};
if (resend) secrets.RESEND_API_KEY = resend;

console.log("Setting Edge secrets on", PROJECT_REF);
console.log("  GOOGLE_OAUTH_CLIENT_ID =", clientId.slice(0, 12) + "…");
console.log("  GOOGLE_OAUTH_CLIENT_SECRET = set");
console.log("  TOKEN_ENCRYPTION_KEY = set");
console.log("  OAUTH_STATE_SECRET = set");
console.log("  RESEND_API_KEY =", resend ? "set" : "missing (invites still copy a link)");
console.log("\nGoogle Cloud → authorized redirect URI (exactly one):");
console.log(`  https://${PROJECT_REF}.supabase.co/functions/v1/oauth`);

const args = Object.entries(secrets)
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  .join(" ");

execSync(`npx supabase secrets set --project-ref ${PROJECT_REF} ${args}`, {
  stdio: "inherit",
  shell: true,
});
console.log("\nDone. Redeploy: npx supabase functions deploy oauth invite --project-ref", PROJECT_REF);
