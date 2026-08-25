/**
 * Production smoke test against the linked Supabase project.
 * Usage: node scripts/smoke/prod.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Missing VITE_SUPABASE_URL / ANON / SERVICE_ROLE in .env");
  process.exit(1);
}

const DEMO_EMAIL = "alfred@prodg.studio";
const DEMO_PASSWORD = "LoopDemo2026!";

const results = [];
function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function main() {
  // 1. Auth login
  const client = createClient(url, anon);
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (authErr || !auth.session) {
    fail("auth.login", authErr?.message ?? "no session");
  } else {
    ok("auth.login", auth.user.id);
  }

  // 2. Profile + commitments via RLS
  if (auth?.session) {
    const { data: profile, error: pErr } = await client.from("users").select("*").eq("id", auth.user.id).single();
    if (pErr || !profile) fail("rls.users", pErr?.message ?? "no profile");
    else ok("rls.users", `${profile.role} @ ${profile.org_id}`);

    const { data: commitments, error: cErr } = await client
      .from("commitments")
      .select("id,title,needs_review,confidence_score")
      .eq("org_id", profile.org_id);
    if (cErr) fail("rls.commitments", cErr.message);
    else {
      const review = (commitments ?? []).filter((c) => c.needs_review).length;
      ok("rls.commitments", `${commitments.length} rows, ${review} in review queue`);
    }

    // 3. Quality tables readable
    const { error: hErr } = await client.from("commitment_status_history").select("id").limit(1);
    if (hErr) fail("rls.status_history", hErr.message);
    else ok("rls.status_history");

    // 4. Edge: send-checkin (in-app fallback without Twilio)
    const { data: ck, error: ckErr } = await client.functions.invoke("send-checkin", {
      body: {
        user_id: auth.user.id,
        commitment_id: commitments?.[0]?.id ?? null,
        text: "Smoke test check-in from Loop production setup.",
      },
    });
    if (ckErr) fail("edge.send-checkin", ckErr.message);
    else ok("edge.send-checkin", JSON.stringify(ck));

    // 5. Edge: escalate sweep (should not throw)
    const { data: esc, error: escErr } = await client.functions.invoke("escalate", { body: {} });
    if (escErr) fail("edge.escalate", escErr.message);
    else ok("edge.escalate", JSON.stringify(esc));

    // 6. Edge: digest
    const { data: dig, error: digErr } = await client.functions.invoke("send-digest", { body: {} });
    if (digErr) fail("edge.send-digest", digErr.message);
    else ok("edge.send-digest", JSON.stringify(dig));
  }

  // 7. Service-role health: meetings table exists
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: mErr } = await admin.from("meetings").select("id").limit(1);
  if (mErr) fail("schema.meetings", mErr.message);
  else ok("schema.meetings");

  const failed = results.filter((r) => !r.pass);
  console.log("\n---");
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
