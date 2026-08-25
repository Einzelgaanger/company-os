/**
 * Ensures alfred@prodg.studio can sign in (creates/updates auth + links to ProDG org).
 * Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/fix-demo-login.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const url = process.env.VITE_SUPABASE_URL || "https://xtvtjbbsilqnwqsmnchx.supabase.co";
const DEMO_EMAIL = "alfred@prodg.studio";
const DEMO_PASSWORD = "LoopDemo2026!";
const OLD_EMAIL = "alfred@prodg.demo";

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const raw = execSync("npx supabase projects api-keys --project-ref xtvtjbbsilqnwqsmnchx", {
      encoding: "utf8",
    });
    const parsed = JSON.parse(raw);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    return keys.find((k) => k.name === "service_role")?.api_key;
  } catch {
    return null;
  }
}

const serviceKey = loadServiceKey();
if (!serviceKey) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY or login with npx supabase login");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = listed.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
  const old = listed.users.find((u) => u.email?.toLowerCase() === OLD_EMAIL);

  if (!user && old) {
    // Rename the existing demo auth user to the studio email.
    const { data, error } = await admin.auth.admin.updateUserById(old.id, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Alfred Maweu" },
    });
    if (error) throw error;
    user = data.user;
    console.log("Renamed", OLD_EMAIL, "→", DEMO_EMAIL);
  } else if (user) {
    await admin.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Alfred Maweu" },
    });
    console.log("Updated password for", DEMO_EMAIL);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Alfred Maweu" },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created", DEMO_EMAIL);
  }

  // Ensure profile row points at this auth user + ProDG org.
  const { data: profile } = await admin.from("users").select("*").eq("id", user.id).maybeSingle();
  if (profile) {
    await admin.from("users").update({ email: DEMO_EMAIL }).eq("id", user.id);
    console.log("Profile already linked to org", profile.org_id);
  } else {
    // Attach to existing ProDG org if present (from earlier seed).
    const { data: org } = await admin.from("organizations").select("id").eq("name", "ProDG").maybeSingle();
    const { data: anyOwner } = await admin.from("users").select("org_id").eq("role", "owner").limit(1).maybeSingle();
    const orgId = org?.id || anyOwner?.org_id;
    if (!orgId) {
      console.error("No ProDG org found — run npm run seed:demo first.");
      process.exit(1);
    }
    // If old profile still on old auth id, re-point it.
    if (old) {
      const { data: oldProfile } = await admin.from("users").select("*").eq("id", old.id).maybeSingle();
      if (oldProfile) {
        // Can't change PK easily; create new profile and leave old (or delete old).
        await admin.from("users").delete().eq("id", old.id);
      }
    }
    const { error } = await admin.from("users").insert({
      id: user.id,
      org_id: orgId,
      full_name: "Alfred Maweu",
      email: DEMO_EMAIL,
      role: "owner",
      status: "active",
      phone_number: "+254700000001",
      phone_verified_at: new Date().toISOString(),
      notification_prefs: { whatsapp_checkins: true },
    });
    if (error) throw error;
    console.log("Linked profile to org", orgId);
  }

  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
