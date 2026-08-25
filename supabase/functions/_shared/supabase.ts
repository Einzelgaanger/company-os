// Shared service-role Supabase client for Edge Functions.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function audit(
  db: any,
  orgId: string,
  actor: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await db.from("audit_log").insert({
    org_id: orgId,
    actor,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}
