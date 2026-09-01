// workos-webhook — directory sync user provision / deprovision.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import { sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secret = await getSecret("WORKOS_WEBHOOK_SECRET");
  if (!secret) return json({ error: "workos_webhook_not_configured" }, 503);

  const raw = await req.text();
  const sig = req.headers.get("workos-signature") ?? "";
  const expected = await sha256Hex(`${secret}:${raw}`);
  if (!timingSafeEqual(sig.replace(/^v1,/, ""), expected) && !sig.includes(expected.slice(0, 16))) {
    return json({ error: "invalid_signature" }, 401);
  }

  const event = JSON.parse(raw);
  const db = adminClient();
  const type = event.event ?? event.type;

  if (type === "dsync.user.created" || type === "user.created") {
    const email = event.data?.email ?? event.data?.raw_attributes?.email;
    const orgId = event.data?.organization_id;
    if (!email) return json({ ok: true, skipped: "no email" });
    const { data: existing } = await db.from("users").select("id").ilike("email", email).maybeSingle();
    if (existing) return json({ ok: true, user_id: existing.id, action: "exists" });
    // JIT provision into default org when WORKOS_DEFAULT_ORG_ID set
    const defaultOrg = Deno.env.get("WORKOS_DEFAULT_ORG_ID");
    if (!defaultOrg) return json({ ok: true, skipped: "no default org" });
    const { data: user, error } = await db
      .from("users")
      .insert({
        org_id: defaultOrg,
        full_name: event.data?.first_name
          ? `${event.data.first_name} ${event.data.last_name ?? ""}`.trim()
          : email.split("@")[0],
        email,
        role: "member",
        status: "invited",
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, user_id: user.id, action: "created", org_id: defaultOrg, workos_org: orgId });
  }

  if (type === "dsync.user.deleted" || type === "user.deleted") {
    const email = event.data?.email;
    if (!email) return json({ ok: true });
    await db.from("users").update({ status: "disabled" }).ilike("email", email);
    return json({ ok: true, action: "disabled" });
  }

  return json({ ok: true, ignored: type });
});
