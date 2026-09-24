#!/usr/bin/env node
/**
 * Apply every archive migration that is not in the original 0001–0008 + 0011
 * production set, then redeploy every Edge function.
 *
 *   node scripts/ops/deploy-pending-supabase.mjs
 *
 * Safe to re-run: the SQL files use IF NOT EXISTS / DROP POLICY IF EXISTS.
 * Stop on the first real SQL error so you can paste that file into the
 * Supabase SQL Editor if the CLI login-role endpoint returns 403.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "pkxnfkubgpbdbftvtgvf";
const MIG_DIR = resolve(process.cwd(), "supabase/archive/migrations");

/** Already recorded as live in docs/ops/PRODUCTION.md. */
const ALREADY_LIVE = new Set([
  "0001_schema.sql",
  "0002_rls.sql",
  "0004_governance.sql",
  "0005_bootstrap.sql",
  "0006_cron.sql",
  "0007_action_item_quality.sql",
  "0008_app_secrets.sql",
  "0011_telegram.sql",
]);

const pending = readdirSync(MIG_DIR)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f) && !ALREADY_LIVE.has(f))
  .sort();

console.log(`Project ${PROJECT_REF}`);
console.log(`Pending migrations (${pending.length}):`);
for (const f of pending) console.log(`  - ${f}`);

const env = { ...process.env };
let failed = null;

for (const file of pending) {
  const sqlPath = resolve(MIG_DIR, file);
  console.log(`\n→ applying ${file}`);
  try {
    execSync(`npx supabase db query --linked -f "${sqlPath}"`, { stdio: "inherit", env });
    console.log(`  ok ${file}`);
  } catch {
    failed = file;
    console.error(`\nCLI apply failed on ${file}.`);
    console.error(`Paste this file into Supabase → SQL Editor, then re-run:`);
    console.error(`  ${sqlPath}`);
    break;
  }
}

console.log("\n→ deploying all Edge functions");
try {
  execSync(`npx supabase functions deploy --project-ref ${PROJECT_REF}`, { stdio: "inherit", env });
  console.log("  functions deployed");
} catch {
  console.error("Function deploy failed. Check `npx supabase login` and the project link.");
  process.exit(1);
}

if (failed) {
  console.error(`\nStopped after ${failed}. Fix that file, then re-run this script.`);
  process.exit(1);
}

console.log("\nDone. Pending SQL is on the project and every function was redeployed.");
