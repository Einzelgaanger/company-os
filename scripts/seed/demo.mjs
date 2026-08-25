/**
 * Seeds a demo owner + ProDG org into the linked Supabase project.
 * Usage: npm run seed:demo
 *
 * Requires VITE_SUPABASE_URL + service role key (reads from .env, env, or CLI).
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env if present (Vite-style KEY=VALUE, no export).
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
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  try {
    // Default CLI JSON wraps keys; -o json may return a bare array.
    const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} -o json`, {
      encoding: "utf8",
    });
    const parsed = JSON.parse(raw);
    const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
    const sr = keys.find((k) => k.name === "service_role" || k.id === "service_role");
    serviceKey = sr?.api_key;
  } catch (e) {
    console.error("Could not load service role key. Set SUPABASE_SERVICE_ROLE_KEY.", e.message);
    process.exit(1);
  }
}

if (!serviceKey) {
  console.error("Could not load service role key. Set SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_EMAIL = "alfred@prodg.studio";
const DEMO_PASSWORD = "LoopDemo2026!";

async function main() {
  // Create or fetch auth user
  let userId;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = listed.data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD, email_confirm: true });
    console.log("Updated existing demo auth user", userId);
  } else {
    const created = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Alfred Okello" },
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    console.log("Created demo auth user", userId);
  }

  // If profile already exists, stop.
  const { data: profile } = await admin.from("users").select("*").eq("id", userId).maybeSingle();
  if (profile) {
    console.log("Demo profile already exists for org", profile.org_id);
    console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    return;
  }

  // Bootstrap via service-role inserts (mirrors bootstrap_organization).
  const slug = `prodg-demo-${userId.replace(/-/g, "").slice(0, 8)}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: "ProDG",
      slug,
      plan: "pilot",
      settings: {
        report_frequency: "daily",
        timezone: "Africa/Nairobi",
        escalation_sla_hours: 24,
        data_retention_months: 12,
        default_classification: "internal",
        require_classification: true,
        autonomy_enabled: true,
        checkin_stale_hours: 48,
        nudge_after_hours: 24,
        report_channels: { email: true, in_app: true, whatsapp: false },
        report_recipient_ids: [userId],
      },
    })
    .select("*")
    .single();
  if (orgErr) throw orgErr;

  const { error: userErr } = await admin.from("users").insert({
    id: userId,
    org_id: org.id,
    full_name: "Alfred Okello",
    email: DEMO_EMAIL,
    role: "owner",
    status: "active",
    phone_number: "+254700000001",
    phone_verified_at: new Date().toISOString(),
    notification_prefs: { whatsapp_checkins: true },
  });
  if (userErr) throw userErr;

  const tags = [
    { name: "client data", color: "teal", classification: "confidential", pii: false },
    { name: "financials", color: "amber", classification: "confidential", pii: false },
    { name: "engineering", color: "slate", classification: "internal", pii: false },
    { name: "pii", color: "red", classification: "restricted", pii: true },
  ];
  const { data: tagRows, error: tagErr } = await admin
    .from("tags")
    .insert(tags.map((t) => ({ ...t, org_id: org.id, description: null })))
    .select("*");
  if (tagErr) throw tagErr;
  const tagByName = Object.fromEntries((tagRows ?? []).map((t) => [t.name, t.id]));

  await admin.from("ownership_map").insert({
    org_id: org.id,
    category: "default",
    primary_owner_id: userId,
    backup_owner_id: null,
    sla_hours: 24,
  });

  const { data: project } = await admin
    .from("projects")
    .insert({
      org_id: org.id,
      name: "VGG Data Platform",
      description: "SharePoint usage analytics for VGG.",
      client_name: "VGG",
      status: "active",
      owner_id: userId,
      sensitivity: "confidential",
      tag_ids: [tagByName["client data"]],
    })
    .select("*")
    .single();

  await admin.from("commitments").insert([
    {
      org_id: org.id,
      project_id: project.id,
      title: "Share SharePoint usage data (column D)",
      description: "Export column D usage metrics for the VGG SharePoint tenant.",
      owner_id: userId,
      requested_by_id: userId,
      source_type: "manual",
      due_date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10),
      status: "overdue",
      priority: "high",
      sensitivity: "confidential",
      tag_ids: [tagByName["client data"]],
      classified_by: "system",
      confidence_score: 0.92,
      needs_review: false,
      source_quote: "Kayode, can you share the SharePoint usage data — specifically column D — before Friday?",
    },
    {
      org_id: org.id,
      project_id: project.id,
      title: "Draft VGG ingestion API spec",
      description: "First draft of the ingestion endpoint contract.",
      owner_id: userId,
      requested_by_id: userId,
      source_type: "manual",
      due_date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
      status: "in_progress",
      priority: "medium",
      sensitivity: "internal",
      tag_ids: [tagByName.engineering],
      classified_by: "system",
      confidence_score: 0.88,
      needs_review: false,
      source_quote: "Wanjiru will draft the ingestion API spec and circulate it mid-week.",
    },
    {
      org_id: org.id,
      project_id: project.id,
      title: "Follow up on the Kenya thing",
      description: "Low-confidence extraction — waiting in review queue.",
      owner_id: userId,
      requested_by_id: userId,
      source_type: "meeting",
      due_date: new Date(Date.now() + 1 * 864e5).toISOString().slice(0, 10),
      status: "open",
      priority: "medium",
      sensitivity: "internal",
      tag_ids: [],
      classified_by: "system",
      confidence_score: 0.41,
      needs_review: true,
      source_quote: "Someone should probably follow up on the Kenya thing.",
    },
  ]);

  console.log("Seeded ProDG demo org", org.id);
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
