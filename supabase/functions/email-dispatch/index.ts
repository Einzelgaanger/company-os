// email-dispatch — retry sweep for the email queue.
//
// sendTemplatedEmail logs before it sends, so anything that crashed mid-flight
// is sitting in email_messages as 'queued' and anything the provider rejected
// is 'failed'. Both are picked up here.
//
// Backoff is derived from the attempt count rather than stored, so a row only
// becomes eligible again once enough time has passed since it was created.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { deliver } from "../_shared/emailer.ts";

const MAX_ATTEMPTS = 4;
/** Minutes to wait before attempt 2, 3 and 4. */
const BACKOFF_MINUTES = [0, 15, 60, 240];
const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let query = db
    .from("email_messages")
    .select("id, to_email, subject, body_html, attempts, created_at")
    .in("status", ["failed", "queued"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (body.org_id) query = query.eq("org_id", body.org_id);

  const { data: pending } = await query;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;

  for (const msg of pending ?? []) {
    const waitMinutes = BACKOFF_MINUTES[Math.min(msg.attempts, BACKOFF_MINUTES.length - 1)];
    const readyAt = new Date(msg.created_at).getTime() + waitMinutes * 60_000;
    if (Date.now() < readyAt) {
      deferred++;
      continue;
    }

    await db
      .from("email_messages")
      .update({ attempts: msg.attempts + 1 })
      .eq("id", msg.id);

    const result = await deliver(db, msg.id, {
      to: msg.to_email,
      subject: msg.subject,
      html: msg.body_html,
    });

    if (result.status === "sent") sent++;
    else if (result.status === "skipped") skipped++;
    else failed++;
  }

  // Anything that exhausted its attempts stops being retried but stays visible
  // in the log with its last error, rather than disappearing.
  return json({ sent, skipped, failed, deferred, considered: (pending ?? []).length });
});
