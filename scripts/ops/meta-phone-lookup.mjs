import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const id = process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
const token = process.env.WHATSAPP_ACCESS_TOKEN;
if (!id || !token) {
  console.error("Missing WHATSAPP_PHONE_ID or WHATSAPP_ACCESS_TOKEN");
  process.exit(1);
}

const res = await fetch(
  `https://graph.facebook.com/v23.0/${id}?fields=display_phone_number,verified_name,quality_rating`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const j = await res.json();
if (!res.ok) {
  console.error(JSON.stringify(j, null, 2));
  process.exit(1);
}
console.log("Business name:", j.verified_name ?? "(unknown)");
console.log("WhatsApp number:", j.display_phone_number ?? "(unknown)");
if (j.quality_rating) console.log("Quality:", j.quality_rating);
