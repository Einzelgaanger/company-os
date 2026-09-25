// sync-sources — pull connected accounts into the hold queue.
// Cron walks every connected row. Each provider that can be listed is stored
// as a held meeting (Governance → Calls) until someone tags it.
// Webhook sources are skipped: they arrive on their own endpoint.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import { decryptToken, encryptToken } from "../_shared/tokenCrypto.ts";

const WEBHOOKS = new Set([
  "fathom",
  "zapier",
  "make",
  "n8n",
  "telegram",
  "whatsapp",
  "twilio",
]);

async function refreshGoogle(refreshToken: string): Promise<string | null> {
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

async function bearer(conn: any, google = false): Promise<string> {
  let token = await decryptToken(conn.access_token as string);
  if (google && conn.refresh_token) {
    const next = await refreshGoogle(await decryptToken(conn.refresh_token));
    if (next) token = next;
  }
  return token;
}

async function hold(
  db: any,
  conn: any,
  externalId: string,
  title: string,
  text: string,
  occurredAt: string | null,
  participants: Array<{ name: string; email: string | null }>,
): Promise<void> {
  const { error } = await db.from("meetings").upsert(
    {
      org_id: conn.org_id,
      source: conn.provider,
      external_id: externalId,
      title: title.slice(0, 300) || "Untitled",
      participants,
      transcript_text: text.slice(0, 8000) || null,
      occurred_at: occurredAt,
      privacy_held: true,
      sensitivity: "internal",
      tag_ids: [],
      processed_at: null,
    },
    { onConflict: "org_id,source,external_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

function header(headers: any[] | undefined, name: string): string {
  const row = (headers ?? []).find((h) => String(h.name).toLowerCase() === name.toLowerCase());
  return String(row?.value ?? "");
}

async function pullGmail(db: any, conn: any): Promise<number> {
  const token = await bearer(conn, true);
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=" +
      encodeURIComponent("newer_than:14d -in:chats"),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) throw new Error(`gmail_${listRes.status}`);
  const list = await listRes.json();
  let stored = 0;
  for (const item of list.messages ?? []) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) continue;
    const msg = await res.json();
    const subject = header(msg.payload?.headers, "Subject") || "(no subject)";
    const from = header(msg.payload?.headers, "From");
    const date = header(msg.payload?.headers, "Date");
    const when = date ? new Date(date).toISOString() : null;
    await hold(
      db,
      conn,
      String(item.id),
      subject,
      String(msg.snippet ?? ""),
      when && !Number.isNaN(Date.parse(when)) ? when : null,
      from ? [{ name: from, email: null }] : [],
    );
    stored += 1;
  }
  if (conn.refresh_token) {
    await db
      .from("connections")
      .update({ access_token: await encryptToken(token) })
      .eq("id", conn.id);
  }
  return stored;
}

async function pullOutlook(db: any, conn: any): Promise<number> {
  const token = await bearer(conn);
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=id,subject,from,receivedDateTime,bodyPreview&$orderby=receivedDateTime desc",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`outlook_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const msg of data.value ?? []) {
    const from = msg.from?.emailAddress;
    await hold(
      db,
      conn,
      String(msg.id),
      String(msg.subject ?? "(no subject)"),
      String(msg.bodyPreview ?? ""),
      msg.receivedDateTime ?? null,
      from ? [{ name: from.name ?? from.address, email: from.address ?? null }] : [],
    );
    stored += 1;
  }
  return stored;
}

async function pullDrive(db: any, conn: any): Promise<number> {
  const token = await bearer(conn, true);
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=20&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,mimeType)",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`google_drive_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const file of data.files ?? []) {
    await hold(
      db,
      conn,
      String(file.id),
      String(file.name ?? "Untitled file"),
      String(file.mimeType ?? ""),
      file.modifiedTime ?? null,
      [],
    );
    stored += 1;
  }
  return stored;
}

async function pullSlack(db: any, conn: any): Promise<number> {
  const token = await bearer(conn);
  const res = await fetch("https://slack.com/api/conversations.list?limit=10&exclude_archived=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`slack_${res.status}`);
  const data = await res.json();
  if (data.ok === false) throw new Error(`slack_${data.error ?? "rejected"}`);
  let stored = 0;
  for (const channel of data.channels ?? []) {
    const hist = await fetch(
      `https://slack.com/api/conversations.history?channel=${channel.id}&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!hist.ok) continue;
    const body = await hist.json();
    if (body.ok === false) continue;
    for (const msg of body.messages ?? []) {
      if (!msg.ts || !msg.text) continue;
      await hold(
        db,
        conn,
        `${channel.id}:${msg.ts}`,
        `#${channel.name ?? "channel"}`,
        String(msg.text),
        new Date(Number(msg.ts) * 1000).toISOString(),
        [],
      );
      stored += 1;
    }
  }
  return stored;
}

async function pullZoom(db: any, conn: any): Promise<number> {
  const token = await bearer(conn);
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings?type=previous_meetings&page_size=15", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`zoom_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const meeting of data.meetings ?? []) {
    await hold(
      db,
      conn,
      String(meeting.uuid ?? meeting.id),
      String(meeting.topic ?? "Zoom meeting"),
      "",
      meeting.start_time ?? null,
      [],
    );
    stored += 1;
  }
  return stored;
}

async function pullGithub(db: any, conn: any): Promise<number> {
  const token = await bearer(conn);
  const res = await fetch("https://api.github.com/notifications?all=false&per_page=20", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "company-os",
    },
  });
  if (!res.ok) throw new Error(`github_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const note of data ?? []) {
    await hold(
      db,
      conn,
      String(note.id),
      String(note.subject?.title ?? note.repository?.full_name ?? "GitHub"),
      String(note.subject?.type ?? ""),
      note.updated_at ?? null,
      [],
    );
    stored += 1;
  }
  return stored;
}

async function pullNotion(db: any, conn: any): Promise<number> {
  const token = await bearer(conn);
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 15, sort: { direction: "descending", timestamp: "last_edited_time" } }),
  });
  if (!res.ok) throw new Error(`notion_${res.status}`);
  const data = await res.json();
  let stored = 0;
  for (const page of data.results ?? []) {
    const titleProp = Object.values(page.properties ?? {}).find((p: any) => p?.type === "title") as any;
    const title = titleProp?.title?.map((t: any) => t.plain_text).join("") || "Untitled";
    await hold(db, conn, String(page.id), title, "", page.last_edited_time ?? null, []);
    stored += 1;
  }
  return stored;
}

const PULLERS: Record<string, (db: any, conn: any) => Promise<number>> = {
  gmail: pullGmail,
  outlook: pullOutlook,
  google_drive: pullDrive,
  google_docs: pullDrive,
  google_sheets: pullDrive,
  slack: pullSlack,
  zoom: pullZoom,
  github: pullGithub,
  notion: pullNotion,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let orgId: string | null = null;
  let onlyProvider: string | null = null;
  try {
    const body = await req.json();
    orgId = body.org_id ?? null;
    onlyProvider = body.provider ?? null;
  } catch {
    /* cron — sync everything connected */
  }

  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (base && key && (!onlyProvider || onlyProvider.endsWith("calendar"))) {
    fetch(`${base}/functions/v1/sync-calendar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(orgId ? { org_id: orgId } : {}),
    }).catch(() => {});
  }

  let q = db.from("connections").select("*").eq("status", "connected");
  if (orgId) q = q.eq("org_id", orgId);
  if (onlyProvider) q = q.eq("provider", onlyProvider);
  const { data: connections } = await q;

  const results: { id: string; provider: string; stored: number; skipped?: string; error?: string }[] = [];
  for (const conn of connections ?? []) {
    if (conn.provider === "google_calendar" || conn.provider === "microsoft_calendar") continue;
    if (WEBHOOKS.has(conn.provider)) {
      results.push({ id: conn.id, provider: conn.provider, stored: 0, skipped: "webhook" });
      continue;
    }
    const pull = PULLERS[conn.provider];
    if (!pull) {
      results.push({ id: conn.id, provider: conn.provider, stored: 0, skipped: "no_puller" });
      continue;
    }
    try {
      const stored = await pull(db, conn);
      await db
        .from("connections")
        .update({ last_synced_at: new Date().toISOString(), error_message: null, status: "connected" })
        .eq("id", conn.id);
      results.push({ id: conn.id, provider: conn.provider, stored });
    } catch (e) {
      const msg = String(e).slice(0, 300);
      await db.from("connections").update({ status: "error", error_message: msg }).eq("id", conn.id);
      results.push({ id: conn.id, provider: conn.provider, stored: 0, error: msg });
    }
  }
  return json({ synced: results.length, results });
});
