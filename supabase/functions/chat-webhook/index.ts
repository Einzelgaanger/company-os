// chat-webhook — Slack / Teams / Zoom ingestion (metadata + text only).
// POST ?provider=slack|teams|zoom&webhook_id=...
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { getSecret } from "../_shared/secrets.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "slack";
  const webhookId = url.searchParams.get("webhook_id") ?? "";
  const raw = await req.text();
  let payload: any = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const db = adminClient();
  const { data: endpoint } = await db
    .from("chat_webhook_endpoints")
    .select("org_id, secret_hash")
    .eq("provider", provider)
    .eq("webhook_id", webhookId)
    .eq("active", true)
    .maybeSingle();

  if (endpoint?.secret_hash) {
    const sig = req.headers.get("x-slack-signature") ?? req.headers.get("x-ms-signature") ?? "";
    const expected = endpoint.secret_hash as string;
    const actual = await sha256Hex(`${webhookId}:${raw}`);
    if (!timingSafeEqual(expected, actual) && !sig.includes(actual.slice(0, 12))) {
      return json({ error: "invalid_signature" }, 401);
    }
  } else {
    const global = await getSecret(`${provider.toUpperCase()}_WEBHOOK_SECRET`);
    if (global) {
      const actual = await sha256Hex(`${global}:${raw}`);
      const sig = req.headers.get("x-slack-signature") ?? "";
      if (sig && !sig.includes(actual.slice(0, 12))) {
        return json({ error: "invalid_signature" }, 401);
      }
    }
  }

  const orgId = endpoint?.org_id ?? payload.org_id;
  if (!orgId) return json({ error: "unknown_webhook" }, 404);

  const text =
    payload.text ??
    payload.message?.text ??
    payload.event?.text ??
    payload.body?.preview ??
    "";
  const externalId = String(
    payload.event_id ?? payload.ts ?? payload.id ?? `${provider}-${Date.now()}`,
  );

  if (text.trim()) {
    const base = Deno.env.get("SUPABASE_URL")!;
    await fetch(`${base}/functions/v1/extract-commitments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        org_id: orgId,
        text,
        source_type: "manual",
        source_meeting_id: null,
      }),
    });
  }

  await db.from("audit_log").insert({
    org_id: orgId,
    actor: "system",
    action: `${provider}.ingest`,
    target_type: "chat_message",
    metadata: { external_id: externalId, webhook_id: webhookId },
  });

  return json({ ok: true, org_id: orgId, external_id: externalId });
});
