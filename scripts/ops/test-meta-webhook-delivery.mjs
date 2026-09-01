/**
 * Simulate Meta inbound webhook with valid signature — proves Supabase handler works.
 * Usage: node scripts/ops/test-meta-webhook-delivery.mjs
 */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const secret = process.env.WHATSAPP_APP_SECRET;
const webhookUrl = process.env.PUBLIC_WEBHOOK_URL;
const wabaId = process.env.WHATSAPP_WABA_ID;
const phoneId = process.env.WHATSAPP_PHONE_ID;

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: wabaId,
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "447822000563", phone_number_id: phoneId },
            contacts: [{ profile: { name: "Alfred" }, wa_id: "254700861129" }],
            messages: [
              {
                from: "254700861129",
                id: `wamid.test.${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Hi" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

const rawBody = JSON.stringify(payload);
const sig = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

console.log("POST", webhookUrl);
const res = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Hub-Signature-256": sig,
  },
  body: rawBody,
});
console.log("Response:", res.status, await res.text());

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
await new Promise((r) => setTimeout(r, 2000));
const { data } = await admin
  .from("checkins")
  .select("direction,message_text,created_at,twilio_sid")
  .order("created_at", { ascending: false })
  .limit(3);
console.log("\nLatest check-ins:", data);
