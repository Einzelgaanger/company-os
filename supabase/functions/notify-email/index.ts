// Sends the branded Resend email for an in-app notification the client just wrote.
// Caller must belong to the same organisation as the recipient.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, corsHeaders, json } from "../_shared/supabase.ts";
import { emailUserNotice } from "../_shared/emailer.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false },
  });
  const { data: authData } = await userClient.auth.getUser();
  if (!authData.user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const userId = String(body.user_id ?? "");
  const title = String(body.title ?? "").slice(0, 200);
  const text = String(body.body ?? "").slice(0, 2000);
  const link = body.link ? String(body.link).slice(0, 300) : null;
  const kind = String(body.kind ?? "system");
  if (!userId || !title) return json({ error: "user_id and title required" }, 400);

  const db = adminClient();
  const { data: caller } = await db.from("users").select("org_id").eq("id", authData.user.id).maybeSingle();
  const { data: recipient } = await db.from("users").select("org_id").eq("id", userId).maybeSingle();
  if (!caller?.org_id || caller.org_id !== recipient?.org_id) return json({ error: "forbidden" }, 403);

  const result = await emailUserNotice(db, {
    orgId: caller.org_id,
    userId,
    kind,
    title,
    body: text,
    link,
    category: kind === "escalation" ? "escalation" : kind === "report" ? "report" : "system",
    template: "notice",
  });
  return json(result);
});
