import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const secret = process.env.WHATSAPP_APP_SECRET;
const payload = { object: "whatsapp_business_account", entry: [] };
const raw = JSON.stringify(payload);
const sig = "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
const url = process.env.PUBLIC_WEBHOOK_URL;

const cases = [
  { label: "no auth", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig } },
  {
    label: "bearer anon",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": sig,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    },
  },
  {
    label: "apikey",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": sig,
      apikey: process.env.VITE_SUPABASE_ANON_KEY,
    },
  },
];

for (const c of cases) {
  const r = await fetch(url, { method: "POST", headers: c.headers, body: raw });
  console.log(c.label, "->", r.status, (await r.text()).slice(0, 150));
}

// GET verify
const vt = process.env.WHATSAPP_VERIFY_TOKEN;
const getUrl = `${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(vt)}&hub.challenge=99999`;
const gr = await fetch(getUrl);
console.log("GET verify ->", gr.status, await gr.text());
