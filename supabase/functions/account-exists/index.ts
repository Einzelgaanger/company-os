// account-exists — whether this email is a Company OS account.
// Password reset used to answer the same way either way. The reset page
// asks first, then sends a link only when the address is registered.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let email = "";
  try {
    const body = await req.json();
    email = String(body.email ?? "");
  } catch {
    email = new URL(req.url).searchParams.get("email") ?? "";
  }
  email = email.trim().toLowerCase();
  if (!email.includes("@")) return json({ error: "email_required" }, 400);

  const db = adminClient();
  const { data: profile } = await db.from("users").select("id").ilike("email", email).maybeSingle();
  if (profile) return json({ exists: true });

  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return json({ error: "lookup_failed" }, 502);
  const res = await fetch(`${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) return json({ error: "lookup_failed" }, 502);
  const body = await res.json();
  const users = Array.isArray(body?.users) ? body.users : Array.isArray(body) ? body : [];
  const exists = users.some((u: any) => String(u.email ?? "").toLowerCase() === email);
  return json({ exists });
});
