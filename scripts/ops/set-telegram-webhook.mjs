#!/usr/bin/env node
/**
 * Set TELEGRAM_BOT_TOKEN on Supabase Edge and register the webhook URL.
 * Usage: node scripts/ops/set-telegram-webhook.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
const base =
  process.env.PUBLIC_TELEGRAM_WEBHOOK_URL?.trim() ||
  `https://${projectRef}.supabase.co/functions/v1/telegram-webhook`;
const webhookUrl = secret ? `${base}?secret=${encodeURIComponent(secret)}` : base;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing in .env");
  process.exit(1);
}

console.log("Pushing TELEGRAM_BOT_TOKEN to Supabase Edge…");
const secretArgs = [`TELEGRAM_BOT_TOKEN=${token}`];
if (secret) secretArgs.push(`TELEGRAM_WEBHOOK_SECRET=${secret}`);
try {
  execSync(
    `npx supabase secrets set --project-ref ${projectRef} ${secretArgs.map((s) => JSON.stringify(s)).join(" ")}`,
    { stdio: "inherit", env: process.env, shell: true },
  );
} catch {
  console.warn("Edge secrets set failed — set manually in Dashboard → Edge Functions → Secrets");
}

console.log(`Registering Telegram webhook → ${webhookUrl}`);
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
if (!data.ok) process.exit(1);

const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
console.log("\nBot:", me.result?.username ? `@${me.result.username}` : me);
console.log("Users link with: LINK +254… (their Company OS phone number)");
