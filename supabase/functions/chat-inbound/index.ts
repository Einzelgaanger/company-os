// chat-inbound — In-app Chat replies (same classify path as Telegram/WhatsApp).
// SPA invokes with the user's JWT. Body: { message_text, commitment_id? }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { processInboundChat } from "../_shared/inboundReply.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser(jwt);
  if (authErr || !authData.user) return json({ error: "unauthorized" }, 401);

  let body: { message_text?: string; commitment_id?: string | null; target_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const messageText = (body.message_text ?? "").trim();
  if (!messageText) return json({ error: "message_text required" }, 400);

  const db = adminClient();
  const actorId = authData.user.id;

  // Managers may post into a report's thread for support; others only themselves.
  let targetUserId = body.target_user_id ?? actorId;
  if (targetUserId !== actorId) {
    const { data: actor } = await db.from("users").select("id, role, org_id").eq("id", actorId).maybeSingle();
    const { data: target } = await db.from("users").select("id, org_id, manager_id").eq("id", targetUserId).maybeSingle();
    if (!actor || !target || actor.org_id !== target.org_id) {
      return json({ error: "forbidden" }, 403);
    }
    const elevated = actor.role === "owner" || actor.role === "admin" || actor.role === "manager";
    const isManagerOf = target.manager_id === actor.id;
    if (!elevated && !isManagerOf) return json({ error: "forbidden" }, 403);
  }

  const result = await processInboundChat({
    userId: targetUserId,
    bodyText: messageText,
    commitmentId: body.commitment_id ?? null,
  });

  if (!result.ok) return json({ error: result.error ?? "failed" }, 400);
  return json({ ok: true, inbound_id: result.inbound_id });
});
