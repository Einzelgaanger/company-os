/**
 * Upserts OpenRouter (and other) keys into app_secrets for edge functions.
 * Also tries Supabase Edge secrets via Management API if SUPABASE_ACCESS_TOKEN is set.
 *
 * Usage: node scripts/ops/set-openrouter-secret.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const url = process.env.VITE_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4";

if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY missing in .env");
  process.exit(1);
}
if (!openRouterKey) {
  console.error("OPENROUTER_API_KEY missing in .env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureTable() {
  // Try upsert; if table missing, apply migration SQL via db query when linked.
  const { error } = await admin.from("app_secrets").select("key").limit(1);
  if (!error) return true;
  if (!String(error.message).includes("app_secrets") && error.code !== "PGRST205" && error.code !== "42P01") {
    console.error("Unexpected error checking app_secrets:", error);
  }
  console.log("app_secrets missing — applying 0008 via supabase db query…");
  const sqlFile = resolve(process.cwd(), "supabase/migrations/0008_app_secrets.sql");
  try {
    execSync(`npx supabase db query --project-ref ${PROJECT_REF} -f "${sqlFile}"`, {
      encoding: "utf8",
      stdio: "inherit",
    });
    return true;
  } catch {
    // Fallback: linked project
    try {
      execSync(`npx supabase db query --linked -f "${sqlFile}"`, { encoding: "utf8", stdio: "inherit" });
      return true;
    } catch (e2) {
      console.error("Could not apply 0008 via CLI. Push migrations from a ProDG-logged-in CLI.");
      console.error(String(e2.message || e2));
      return false;
    }
  }
}

async function upsertDb() {
  const rows = [
    { key: "OPENROUTER_API_KEY", value: openRouterKey, updated_at: new Date().toISOString() },
    { key: "OPENROUTER_MODEL", value: openRouterModel, updated_at: new Date().toISOString() },
  ];
  const { error } = await admin.from("app_secrets").upsert(rows, { onConflict: "key" });
  if (error) throw error;
  console.log("Stored OPENROUTER_API_KEY + OPENROUTER_MODEL in app_secrets");
}

async function tryEdgeSecrets() {
  try {
    execSync(
      `npx supabase secrets set --project-ref ${PROJECT_REF} OPENROUTER_API_KEY=${openRouterKey} OPENROUTER_MODEL=${openRouterModel}`,
      { encoding: "utf8", stdio: "inherit" }
    );
    console.log("Also set Edge Function secrets");
  } catch {
    console.log("Edge secrets set skipped (CLI not on ProDG org) — DB app_secrets is enough once edges read it.");
  }
}

const ok = await ensureTable();
if (!ok) process.exit(1);
await upsertDb();
await tryEdgeSecrets();
