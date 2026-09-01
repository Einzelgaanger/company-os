// sync-calendar — incremental Google / Microsoft calendar metadata sync.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const clientId = await getSecret("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = await getSecret("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

async function syncGoogleConnection(db: any, conn: any): Promise<number> {
  let token = conn.access_token as string;
  if (conn.refresh_token) {
    const refreshed = await refreshGoogleToken(conn.refresh_token);
    if (refreshed) {
      token = refreshed;
      await db.from("connections").update({ access_token: token, last_synced_at: new Date().toISOString() }).eq("id", conn.id);
    }
  }
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(since)}&singleEvents=true&maxResults=100&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`google_calendar_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const ev of data.items ?? []) {
    const title = String(ev.summary ?? "Untitled");
    if (/^(ooo|out of office|focus time|lunch|break)/i.test(title)) continue;
    await db.from("calendar_events").upsert(
      {
        org_id: conn.org_id,
        connection_id: conn.id,
        external_id: String(ev.id),
        title,
        starts_at: ev.start?.dateTime ?? ev.start?.date ?? null,
        ends_at: ev.end?.dateTime ?? ev.end?.date ?? null,
        is_recurring: Boolean(ev.recurringEventId),
        synced_at: new Date().toISOString(),
      },
      { onConflict: "org_id,connection_id,external_id" },
    );
    stored += 1;
  }
  return stored;
}

async function syncMicrosoftConnection(db: any, conn: any): Promise<number> {
  const token = conn.access_token as string;
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(since)}&endDateTime=${encodeURIComponent(new Date().toISOString())}&$top=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`microsoft_calendar_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const ev of data.value ?? []) {
    const title = String(ev.subject ?? "Untitled");
    if (/^(ooo|out of office|focus time|lunch|break)/i.test(title)) continue;
    await db.from("calendar_events").upsert(
      {
        org_id: conn.org_id,
        connection_id: conn.id,
        external_id: String(ev.id),
        title,
        starts_at: ev.start?.dateTime ?? null,
        ends_at: ev.end?.dateTime ?? null,
        is_recurring: Boolean(ev.seriesMasterId),
        synced_at: new Date().toISOString(),
      },
      { onConflict: "org_id,connection_id,external_id" },
    );
    stored += 1;
  }
  return stored;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let orgId: string | null = null;
  try {
    const body = await req.json();
    orgId = body.org_id ?? null;
  } catch {
    /* cron — sync all */
  }

  let q = db
    .from("connections")
    .select("*")
    .eq("status", "connected")
    .in("provider", ["google_calendar", "microsoft_calendar"]);
  if (orgId) q = q.eq("org_id", orgId);
  const { data: connections } = await q;

  const results: { id: string; stored: number; error?: string }[] = [];
  for (const conn of connections ?? []) {
    try {
      const stored =
        conn.provider === "google_calendar"
          ? await syncGoogleConnection(db, conn)
          : await syncMicrosoftConnection(db, conn);
      await db.from("connections").update({ last_synced_at: new Date().toISOString(), error_message: null }).eq("id", conn.id);
      results.push({ id: conn.id, stored });
    } catch (e) {
      const msg = String(e);
      await db.from("connections").update({ status: "error", error_message: msg }).eq("id", conn.id);
      results.push({ id: conn.id, stored: 0, error: msg });
    }
  }
  return json({ synced: results.length, results });
});
