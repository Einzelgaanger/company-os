// fathom-webhook — signed meeting ingest → ingest-meeting edge function.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { sha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { getSecret } from "../_shared/secrets.ts";

async function verifyFathom(req: Request, raw: string, webhookId: string): Promise<string | null> {
  const sig = req.headers.get("x-fathom-signature") ?? req.headers.get("x-hub-signature-256") ?? "";
  const globalSecret = await getSecret("FATHOM_WEBHOOK_SECRET");
  if (globalSecret && sig) {
    const expected = await sha256Hex(`${globalSecret}:${raw}`);
    if (timingSafeEqual(sig.replace(/^sha256=/, ""), expected) || timingSafeEqual(sig, expected)) {
      return null; // resolved via global secret — org from payload
    }
  }
  const db = adminClient();
  const { data: endpoint } = await db
    .from("fathom_webhook_endpoints")
    .select("org_id, secret_hash")
    .eq("webhook_id", webhookId)
    .eq("active", true)
    .maybeSingle();
  if (!endpoint) return null;
  const expected = endpoint.secret_hash as string;
  const actual = await sha256Hex(`${webhookId}:${raw}`);
  if (!timingSafeEqual(expected, actual)) return null;
  return endpoint.org_id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const webhookId = url.searchParams.get("webhook_id") ?? url.pathname.split("/").pop() ?? "";
  const raw = await req.text();
  let payload: any = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  let orgId = payload.org_id ?? (await verifyFathom(req, raw, webhookId));
  if (!orgId) {
    orgId = await verifyFathom(req, raw, webhookId);
  }
  if (!orgId && (await getSecret("FATHOM_WEBHOOK_SECRET"))) {
    orgId = payload.org_id;
  }
  if (!orgId) return json({ error: "unauthorized" }, 401);

  const base = Deno.env.get("SUPABASE_URL")!;
  const res = await fetch(`${base}/functions/v1/ingest-meeting`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      "x-loop-internal": "fathom-webhook",
    },
    body: JSON.stringify({
      org_id: orgId,
      source: "fathom",
      external_id: String(payload.id ?? payload.recording_id ?? payload.event_id ?? ""),
      title: payload.title ?? payload.meeting_title ?? "Fathom meeting",
      participants: payload.participants ?? [],
      transcript_text: payload.transcript ?? payload.transcript_text ?? "",
      transcript_url: payload.transcript_url ?? null,
      recording_url: payload.recording_url ?? payload.url ?? null,
      occurred_at: payload.occurred_at ?? payload.started_at ?? null,
    }),
  });
  const out = await res.json();
  return json(out, res.status as 200);
});
