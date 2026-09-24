// invite — send, preview, and accept workspace invitations.
//
//   POST { action: "send", email, role }     admin JWT
//   GET  ?token=…                            public preview
//   POST { action: "accept", token, password, fullName }  public
//
// Accept creates a confirmed Auth user so the invite token is the proof —
// the person is not stuck behind a second confirmation email.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, audit, corsHeaders, json } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailTemplates, sendTemplatedEmail } from "../_shared/emailer.ts";

const APP = Deno.env.get("PUBLIC_APP_URL") ?? "https://os.jabali.studio";
const ROLES = new Set(["member", "manager", "admin"]);

function inviteUrl(token: string): string {
  return `${APP.replace(/\/$/, "")}/invite/${token}`;
}

async function caller(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false },
  });
  const { data } = await userClient.auth.getUser();
  return data.user ?? null;
}

async function peek(token: string) {
  const db = adminClient();
  const { data: inv } = await db.from("invites").select("email, role, org_id").eq("token", token).maybeSingle();
  if (!inv) return json({ error: "invite_not_found" }, 404);
  const { data: org } = await db.from("organizations").select("name").eq("id", inv.org_id).maybeSingle();
  return json({ email: inv.email, role: inv.role, org_name: org?.name ?? "your team" });
}

async function send(req: Request) {
  const authUser = await caller(req);
  if (!authUser) return json({ error: "unauthenticated" }, 401);

  const db = adminClient();
  const { data: actor } = await db.from("users").select("*").eq("id", authUser.id).maybeSingle();
  if (!actor || !["owner", "admin"].includes(actor.role)) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "member");
  if (!email.includes("@")) return json({ error: "invalid_email" }, 400);
  if (!ROLES.has(role)) return json({ error: "invalid_role" }, 400);
  if (role === "admin" && actor.role !== "owner") return json({ error: "only_owner_invites_admin" }, 403);

  const { data: already } = await db
    .from("users")
    .select("id")
    .eq("org_id", actor.org_id)
    .ilike("email", email)
    .maybeSingle();
  if (already) return json({ error: "already_a_member" }, 409);

  let invite = (
    await db.from("invites").select("*").eq("org_id", actor.org_id).ilike("email", email).maybeSingle()
  ).data;
  if (!invite) {
    const inserted = await db
      .from("invites")
      .insert({
        org_id: actor.org_id,
        email,
        role,
        manager_id: body.manager_id ?? null,
        created_by: actor.id,
      })
      .select("*")
      .single();
    if (inserted.error) return json({ error: inserted.error.message }, 400);
    invite = inserted.data;
  }

  const { data: org } = await db.from("organizations").select("name").eq("id", actor.org_id).maybeSingle();
  const orgName = org?.name ?? "your team";
  const url = inviteUrl(invite.token);
  const mail = emailTemplates.invite_user({
    recipient: { email },
    orgName,
    role,
    inviterName: actor.full_name ?? actor.email,
    token: invite.token,
  });

  let emailed = false;
  let emailVia: "resend" | "supabase" | null = null;

  try {
    const logged = await sendTemplatedEmail(db, {
      orgId: actor.org_id,
      to: { email },
      category: "system",
      template: "invite_user",
      subject: mail.subject,
      html: mail.html,
      relatedType: "invite",
      relatedId: invite.token,
    });
    if (logged.status === "sent") {
      emailed = true;
      emailVia = "resend";
    }
  } catch {
    /* email_messages may not exist yet — fall through */
  }

  if (!emailed) {
    const raw = await sendEmail({ to: email, subject: mail.subject, html: mail.html });
    if (!("skipped" in raw)) {
      emailed = true;
      emailVia = "resend";
    }
  }

  if (!emailed) {
    const { error } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: url,
      data: { invite_token: invite.token, org_name: orgName },
    });
    if (!error) {
      emailed = true;
      emailVia = "supabase";
    }
  }

  await audit(db, actor.org_id, actor.id, "user.invited", "invite", invite.token, {
    email,
    role,
    emailed,
    emailVia,
  });

  return json({
    token: invite.token,
    invite_url: url,
    emailed,
    email_via: emailVia,
    email,
    role,
  });
}

async function findAuthUserId(db: any, email: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) return null;
  const payload = await res.json();
  const users = Array.isArray(payload) ? payload : payload.users ?? [];
  const match = users.find((u: any) => String(u.email ?? "").toLowerCase() === email);
  return match?.id ?? null;
}

async function accept(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  if (!token || password.length < 8) return json({ error: "invalid_input" }, 400);

  const db = adminClient();
  const { data: inv } = await db.from("invites").select("*").eq("token", token).maybeSingle();
  if (!inv) return json({ error: "invite_not_found" }, 404);

  const email = String(inv.email).toLowerCase();
  let userId: string | null = null;

  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split("@")[0] },
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else {
    userId = await findAuthUserId(db, email);
    if (!userId) return json({ error: created.error?.message ?? "could_not_create_user" }, 400);
    await db.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });
  }

  const { data: existing } = await db.from("users").select("id").eq("id", userId).maybeSingle();
  if (!existing) {
    const inserted = await db.from("users").insert({
      id: userId,
      org_id: inv.org_id,
      full_name: fullName || email.split("@")[0],
      email,
      role: inv.role,
      manager_id: inv.manager_id,
      status: "active",
      notification_prefs: { whatsapp_checkins: true },
      last_active_at: new Date().toISOString(),
    });
    if (inserted.error) return json({ error: inserted.error.message }, 400);
  }

  await db.from("invites").delete().eq("token", token);
  await audit(db, inv.org_id, userId, "user.joined", "user", userId, { via: "invite" });
  return json({ email, org_id: inv.org_id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (req.method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    if (!token) return json({ error: "missing_token" }, 400);
    return peek(token);
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Re-parse is cheap; send/accept read the body again from a clone.
  const replay = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(body),
  });
  if (body.action === "accept") return accept(replay);
  return send(replay);
});
