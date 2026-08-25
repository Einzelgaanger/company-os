// send-digest — morning commitment digest (DANI pattern, Loop-native)
// Groups overdue / due today / upcoming / no-due per owner; in-app + optional WhatsApp.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";

function todayStr(tzOffsetMin = 0): string {
  const d = new Date(Date.now() + tzOffsetMin * 60_000);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = adminClient();
    const { data: orgs } = await db.from("organizations").select("id, settings");
    let sent = 0;

    for (const org of orgs ?? []) {
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      if (settings.daily_digest_enabled === false) continue;

      const today = todayStr();
      const week = addDays(today, 7);

      const { data: commitments } = await db
        .from("commitments")
        .select("*")
        .eq("org_id", org.id)
        .neq("status", "done");

      const { data: users } = await db.from("users").select("*").eq("org_id", org.id).eq("status", "active");
      const byOwner = new Map<string, any[]>();
      for (const c of commitments ?? []) {
        if (!c.owner_id) continue;
        if (c.snoozed_until && c.snoozed_until >= today) continue;
        const arr = byOwner.get(c.owner_id) ?? [];
        arr.push(c);
        byOwner.set(c.owner_id, arr);
      }

      for (const user of users ?? []) {
        const prefs = (user.notification_prefs ?? {}) as Record<string, unknown>;
        if (prefs.daily_digest === false) continue;
        const items = byOwner.get(user.id) ?? [];
        if (!items.length) continue;

        const overdue = items.filter((c) => c.due_date && c.due_date < today);
        const dueToday = items.filter((c) => c.due_date === today);
        const upcoming = items.filter((c) => c.due_date && c.due_date > today && c.due_date <= week);
        const noDue = items.filter((c) => !c.due_date);
        if (!(overdue.length || dueToday.length || upcoming.length || noDue.length)) continue;

        const lines = [`Good morning ${String(user.full_name).split(" ")[0]} — your Loop digest:`];
        const push = (label: string, list: any[]) => {
          if (!list.length) return;
          lines.push(`\n${label}`);
          list.slice(0, 8).forEach((c, i) => lines.push(`${i + 1}. ${c.title}${c.due_date ? ` (due ${c.due_date})` : ""}`));
        };
        push("Overdue", overdue);
        push("Due today", dueToday);
        push("Upcoming (7d)", upcoming);
        push("No due date", noDue);

        const body = lines.join("\n");
        await db.from("notifications").insert({
          org_id: org.id,
          user_id: user.id,
          kind: "system",
          title: "Morning digest",
          body: body.slice(0, 500),
          link: "/commitments",
        });
        await db.from("checkins").insert({
          org_id: org.id,
          user_id: user.id,
          commitment_id: null,
          direction: "outbound",
          channel: user.phone_verified_at ? "whatsapp" : "in_app",
          message_type: "daily_pulse",
          message_text: body,
          parsed_status: null,
          parsed_blocker: null,
        });
        sent++;
      }
    }

    return json({ sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
