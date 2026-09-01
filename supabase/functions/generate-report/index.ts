// generate-report (BUILD_SPEC 8.6)
// Cron-triggered daily/weekly per org. Gathers period activity, asks Claude to
// summarise recurring blocker themes, renders the report body, and delivers it.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { claude } from "../_shared/anthropic.ts";
import { sendEmail } from "../_shared/email.ts";
import { uploadReportPdf, renderMarkdownPdf } from "../_shared/s3.ts";

function periodBounds(type: "daily" | "weekly") {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (type === "weekly" ? 7 : 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), startTs: start.toISOString() };
}

async function generateForOrg(db: any, org: any, type: "daily" | "weekly") {
  const { start, end, startTs } = periodBounds(type);

  const { data: commitments } = await db.from("commitments").select("*").eq("org_id", org.id).gte("updated_at", startTs);
  const { data: escalations } = await db.from("escalations").select("*").eq("org_id", org.id).gte("created_at", startTs);
  const { data: blockers } = await db
    .from("checkins")
    .select("parsed_blocker")
    .eq("org_id", org.id)
    .not("parsed_blocker", "is", null)
    .gte("created_at", startTs);

  const open = (commitments ?? []).filter((c: any) => c.status !== "done").length;
  const overdue = (commitments ?? []).filter((c: any) => c.status === "overdue").length;
  const resolved = (commitments ?? []).filter((c: any) => c.status === "done").length;
  const escalatedCount = (escalations ?? []).length;
  const resolvedEsc = (escalations ?? []).filter((e: any) => e.status === "resolved").length;

  let themes = "- No recurring themes surfaced this period.";
  const blockerTexts = (blockers ?? []).map((b: any) => b.parsed_blocker).filter(Boolean);
  if (blockerTexts.length) {
    try {
      themes = await claude(
        "You summarise workplace blockers into themes. Do not name individuals unless a theme is isolated to one person and materially important.",
        `Summarize recurring themes across these blockers in 2-4 bullet points (markdown "- " bullets):\n${blockerTexts.join("\n")}`
      );
    } catch {
      themes = "- Blocker themes unavailable (summary service error).";
    }
  }

  const content_md = [
    `## ${type === "daily" ? "Daily" : "Weekly"} summary — ${org.name}`,
    "",
    `**Headline:** ${escalatedCount} escalation(s), ${resolved} resolved, ${overdue} overdue.`,
    "",
    "### Needs your attention",
    ...((commitments ?? [])
      .filter((c: any) => ["overdue", "escalated", "at_risk"].includes(c.status))
      .map((c: any) => `- **${c.title}** — ${c.status.replace("_", " ")}`)),
    "",
    "### Team pulse",
    themes.trim(),
    "",
    "### Progress since last report",
    `- ${resolved} commitment(s) resolved, ${resolvedEsc} escalation(s) closed.`,
  ].join("\n");

  const recipients = org.settings?.report_recipient_ids ?? [];

  const { data: report } = await db
    .from("reports")
    .insert({
      org_id: org.id,
      type,
      period_start: start,
      period_end: end,
      content_md,
      content_json: { open, overdue, resolved, escalated: escalatedCount },
      recipient_ids: recipients,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  let pdf_url: string | null = null;
  let pdf_sha256: string | null = null;
  try {
    const pdfBytes = await renderMarkdownPdf(content_md);
    const uploaded = await uploadReportPdf({
      orgId: org.id,
      reportId: report.id,
      bytes: pdfBytes,
    });
    pdf_url = uploaded.url;
    pdf_sha256 = uploaded.sha256;
    await db.from("reports").update({ pdf_url, pdf_sha256 }).eq("id", report.id);
  } catch {
    /* PDF optional when storage bucket missing */
  }

  // In-app notifications + optional email delivery
  for (const uid of recipients) {
    await db.from("notifications").insert({
      org_id: org.id,
      user_id: uid,
      kind: "report",
      title: `${type === "daily" ? "Daily" : "Weekly"} report published`,
      body: `Your ${type} summary for ${org.name} is ready.`,
      link: `/reports/${report.id}`,
    });
    const { data: recipient } = await db.from("users").select("email, full_name").eq("id", uid).maybeSingle();
    if (recipient?.email) {
      try {
        await sendEmail({
          to: recipient.email,
          subject: `Loop ${type} report — ${org.name}`,
          html: `<p>Hi ${recipient.full_name ?? ""},</p><p>Your ${type} report is ready.</p><pre style="white-space:pre-wrap">${content_md.replace(/</g, "&lt;")}</pre>${pdf_url ? `<p><a href="${pdf_url}">Download PDF</a></p>` : ""}`,
        });
      } catch {
        /* email optional */
      }
    }
  }

  return report.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { data: orgs } = body.org_id
    ? await db.from("organizations").select("*").eq("id", body.org_id)
    : await db.from("organizations").select("*");

  const ids: string[] = [];
  for (const org of orgs ?? []) {
    const freq = org.settings?.report_frequency ?? "daily";
    const type: "daily" | "weekly" = body.type ?? (freq === "weekly" ? "weekly" : "daily");
    if (freq === "both" || freq === type || body.type) {
      ids.push(await generateForOrg(db, org, type));
    }
  }
  return json({ generated: ids.length, ids });
});
