// oauth — Google / Microsoft connector OAuth (calendar, drive, email scopes).
// GET ?provider=google_calendar&action=start&state=orgId:userId
// GET ?provider=google_calendar&action=callback&code=...&state=...
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";

const REDIRECT_BASE =
  Deno.env.get("PUBLIC_APP_URL") ?? Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";

const SCOPES: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  google_calendar: "https://www.googleapis.com/auth/calendar.readonly",
  google_drive: "https://www.googleapis.com/auth/drive.readonly",
  outlook: "offline_access Mail.Read",
  microsoft_calendar: "offline_access Calendars.Read User.Read",
  onedrive: "offline_access Files.Read.All",
  fathom: "read",
  slack: "channels:history",
  teams: "Chat.Read",
};

function isGoogle(p: string) {
  return ["gmail", "google_calendar", "google_drive"].includes(p);
}

function emailGated(provider: string): boolean {
  if (provider !== "gmail" && provider !== "outlook") return false;
  return Deno.env.get("FEATURE_EMAIL_INGESTION") !== "true";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "";
  const action = url.searchParams.get("action") ?? "start";
  const db = adminClient();

  if (!provider || !SCOPES[provider]) return json({ error: "unknown provider" }, 404);
  if (emailGated(provider)) {
    return json({ error: "email_ingestion_disabled", hint: "Set FEATURE_EMAIL_INGESTION=true after CASA" }, 403);
  }

  const google = isGoogle(provider);
  const clientId = google
    ? await getSecret("GOOGLE_OAUTH_CLIENT_ID")
    : await getSecret("MICROSOFT_OAUTH_CLIENT_ID");
  const clientSecret = google
    ? await getSecret("GOOGLE_OAUTH_CLIENT_SECRET")
    : await getSecret("MICROSOFT_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return json({ error: "oauth_not_configured", provider }, 503);
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth?provider=${provider}&action=callback`;

  if (action === "start") {
    const state = url.searchParams.get("state") ?? "";
    const authUrl = google
      ? `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=offline&prompt=consent` +
        `&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPES[provider])}&state=${encodeURIComponent(state)}`
      : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPES[provider])}&state=${encodeURIComponent(state)}`;
    return Response.redirect(authUrl, 302);
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    const [org_id, user_id] = state.split(":");
    if (!code || !org_id) return json({ error: "missing code/state" }, 400);

    const tokenUrl = google
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return json({ error: `token exchange failed: ${await tokenRes.text()}` }, 502);
    const tokens = await tokenRes.json();

    let external_account_email: string | null = null;
    try {
      if (google) {
        const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (ui.ok) external_account_email = ((await ui.json()) as { email?: string }).email ?? null;
      } else {
        const me = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (me.ok) {
          const u = (await me.json()) as { mail?: string; userPrincipalName?: string };
          external_account_email = u.mail ?? u.userPrincipalName ?? null;
        }
      }
    } catch {
      /* optional */
    }

    const row = {
      org_id,
      user_id: user_id || null,
      provider,
      status: "connected",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      scopes: [SCOPES[provider]],
      external_account_email,
      connected_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      error_message: null,
    };

    const { data: existing } = await db
      .from("connections")
      .select("id")
      .eq("org_id", org_id)
      .eq("provider", provider)
      .eq("user_id", user_id || null)
      .maybeSingle();

    if (existing) {
      await db.from("connections").update(row).eq("id", existing.id);
    } else {
      await db.from("connections").insert(row);
    }

    // Kick calendar sync for calendar providers
    if (provider === "google_calendar" || provider === "microsoft_calendar") {
      const base = Deno.env.get("SUPABASE_URL")!;
      fetch(`${base}/functions/v1/sync-calendar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ org_id }),
      }).catch(() => {});
    }

    return Response.redirect(`${REDIRECT_BASE}/integrations?connected=${provider}`, 302);
  }

  return json({ error: "unknown action" }, 404);
});
