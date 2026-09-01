/** Check if inbound WhatsApp reached Loop. Usage: node scripts/ops/whatsapp-inbound-debug.mjs */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users } = await admin
  .from("users")
  .select("id,full_name,phone_number,phone_verified_at")
  .not("phone_number", "is", null);

console.log("Registered Loop users with phones:");
for (const u of users ?? []) {
  console.log(`  ${u.full_name}: ${u.phone_number} verified=${Boolean(u.phone_verified_at)}`);
}

const since = new Date(Date.now() - 2 * 3600_000).toISOString();
const { data: checkins } = await admin
  .from("checkins")
  .select("id,direction,message_text,created_at,user_id,twilio_sid")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(10);

console.log("\nCheck-ins (last 2h):");
if (!checkins?.length) console.log("  (none — webhook may not have received your message)");
else {
  for (const c of checkins) {
    console.log(`  [${c.direction}] ${c.created_at} "${c.message_text?.slice(0, 40)}" sid=${c.twilio_sid?.slice(0, 20)}…`);
  }
}

// Meta app webhook fields
const appId = process.env.WHATSAPP_APP_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;
if (appId && token) {
  const res = await fetch(`https://graph.facebook.com/v23.0/${appId}/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  console.log("\nMeta app subscriptions:", JSON.stringify(j, null, 2).slice(0, 800));
}
