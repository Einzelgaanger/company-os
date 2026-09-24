/**
 * Push RESEND_API_KEY (and optional REPORT_FROM_ADDRESS) to Supabase Edge only.
 * Uses --env-file so secrets never appear in shell history or error messages.
 */
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
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const resend = process.env.RESEND_API_KEY?.trim();
const from = process.env.REPORT_FROM_ADDRESS?.trim();

if (!resend) {
  console.error("Missing RESEND_API_KEY in .env");
  process.exit(1);
}

const tmp = join(tmpdir(), `loop-resend-${Date.now()}.env`);
const lines = [`RESEND_API_KEY=${resend}`];
if (from) lines.push(`REPORT_FROM_ADDRESS=${from}`);
writeFileSync(tmp, lines.join("\n") + "\n", "utf8");

console.log("Setting Resend on", PROJECT_REF);
console.log("  RESEND_API_KEY = set");
console.log("  REPORT_FROM_ADDRESS =", from ? "set" : "(default noreply@prodg.studio)");

try {
  execSync(`npx supabase secrets set --project-ref ${PROJECT_REF} --env-file "${tmp}"`, {
    stdio: "inherit",
    shell: true,
  });
  console.log(
    "\nRedeploy: npx supabase functions deploy invite email-dispatch --project-ref",
    PROJECT_REF,
  );
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}
