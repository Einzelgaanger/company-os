// oauth (BUILD_SPEC Section 10 & 13)
// GET /oauth/:provider/start    -> returns provider consent redirect URL
// GET /oauth/:provider/callback -> exchanges code, stores tokens in connections
// Requests least-privilege, read-only scopes. Tokens are never returned to the
// client; only status + external_account_email are exposed via the API/RLS.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";

const REDIRECT_BASE = Deno.env.get("PUBLIC_APP_URL") ?? "http://localhost:5173";

const SCOPES: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  google_calendar: "https://www.googleapis.com/auth/calendar.readonly",
  google_drive: "https://www.googleapis.com/auth/drive.readonly",
  outlook: "offline_access Mail.Read",
  microsoft_calendar: "offline_access Calendars.Read",
  onedrive: "offline_access Files.Read.All",
};

function isGoogle(p: string) {
  return ["gmail", "google_calendar", "google_drive"].includes(p);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // [functions, v1, oauth, :provider, :action]
  const provider = parts[parts.length - 2];
  const action = parts[parts.length - 1];
  const db = adminClient();

  const google = isGoogle(provider);
  const clientId = Deno.env.get(google ? "GOOGLE_OAUTH_CLIENT_ID" : "MICROSOFT_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get(google ? "GOOGLE_OAUTH_CLIENT_SECRET" : "MICROSOFT_OAUTH_CLIENT_SECRET")!;
  const redirectUri = `${REDIRECT_BASE}/integrations/${provider}/callback`;

  if (action === "start") {
    const state = url.searchParams.get("state") ?? "";
    const authUrl = google
      ? `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=offline&prompt=consent` +
        `&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPES[provider])}&state=${state}`
      : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?response_type=code` +
        `&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPES[provider])}&state=${state}`;
    return json({ url: authUrl });
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? ""; // expects `${org_id}:${user_id}`
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

    await db.from("connections").upsert(
      {
        org_id,
        user_id: user_id || null,
        provider,
        status: "connected",
        access_token: tokens.access_token, // encrypt via Vault in production
        refresh_token: tokens.refresh_token ?? null,
        scopes: [SCOPES[provider]],
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider,user_id" }
    );

    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 404);
});
