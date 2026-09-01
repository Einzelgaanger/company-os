#!/usr/bin/env node
/**
 * Apply supabase/archive/migrations SQL to the linked Supabase project.
 * Usage: node scripts/ops/apply-supabase-migration.mjs [filename]
 */
import { readFileSync, existsSync } from "node:fs";
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

const file = process.argv[2] ?? "0009_production_infra.sql";
const sqlPath = resolve(process.cwd(), "supabase/archive/migrations", file);
const ref = process.env.SUPABASE_PROJECT_REF ?? "pkxnfkubgpbdbftvtgvf";

console.log(`Applying ${file} to ${ref}…`);

try {
  execSync(`npx supabase db query --linked -f "${sqlPath}"`, {
    stdio: "inherit",
    env: process.env,
  });
  console.log("Migration applied.");
} catch {
  console.error("CLI apply failed — paste SQL from:", sqlPath);
  console.error("into Supabase Dashboard → SQL Editor.");
  process.exit(1);
}
