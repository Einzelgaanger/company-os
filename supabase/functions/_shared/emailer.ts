// Templated email with delivery logging, preference and suppression checks.
//
// _shared/email.ts is the raw Resend transport. Everything in the product sends
// through this module instead, so that every message lands in email_messages and
// a failed send can be retried by the email-dispatch function.
// deno-lint-ignore-file no-explicit-any
import { sendEmail } from "./email.ts";

export type EmailCategory =
  | "escalation"
  | "checkin"
  | "survey"
  | "report"
  | "digest"
  | "project_pulse"
  | "system";

/** Operational mail a person cannot opt out of while they hold an account. */
const MANDATORY: EmailCategory[] = ["system"];

const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://companyos.jabali.studio";

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal inline-styled shell — email clients ignore stylesheets. */
export function layout(input: {
  heading: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaPath?: string;
  unsubscribeToken?: string | null;
  category: EmailCategory;
}): string {
  const cta =
    input.ctaLabel && input.ctaPath
      ? `<p style="margin:28px 0"><a href="${APP_URL}${input.ctaPath}" style="background:#0E1F1A;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(input.ctaLabel)}</a></p>`
      : "";

  const unsubscribe =
    input.unsubscribeToken && !MANDATORY.includes(input.category)
      ? `<a href="${APP_URL}/email/unsubscribe?token=${input.unsubscribeToken}&category=${input.category}" style="color:#6b7280">Turn off ${input.category.replace("_", " ")} email</a> · `
      : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f5;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0E1F1A">
<tr><td style="padding:24px 28px 0"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Company OS</div></td></tr>
<tr><td style="padding:12px 28px 0"><h1 style="margin:0;font-size:20px;line-height:1.3">${escapeHtml(input.heading)}</h1></td></tr>
${input.intro ? `<tr><td style="padding:10px 28px 0"><p style="margin:0;font-size:15px;line-height:1.6;color:#374151">${escapeHtml(input.intro)}</p></td></tr>` : ""}
<tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.6;color:#374151">${input.bodyHtml}</td></tr>
<tr><td style="padding:0 28px">${cta}</td></tr>
<tr><td style="padding:8px 28px 26px;border-top:1px solid #f0f0f0;font-size:12px;color:#6b7280">
${unsubscribe}<a href="${APP_URL}/settings/profile" style="color:#6b7280">Notification settings</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function list(items: string[]): string {
  if (!items.length) return `<p style="margin:0;color:#6b7280">Nothing to show.</p>`;
  return `<ul style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin-bottom:6px">${i}</li>`).join("")}</ul>`;
}

/** Markdown-ish report bodies are rendered as preformatted text, not parsed. */
export function preformatted(text: string): string {
  return `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;margin:0">${escapeHtml(text)}</pre>`;
}

type Recipient = {
  id?: string | null;
  email?: string | null;
  full_name?: string | null;
  email_prefs?: Record<string, boolean> | null;
  email_unsubscribe_token?: string | null;
};

function optedOut(user: Recipient, category: EmailCategory): boolean {
  if (MANDATORY.includes(category)) return false;
  return user.email_prefs?.[category] === false;
}

/**
 * Log first, then attempt delivery, so a crash mid-send leaves a queued row the
 * retry sweep can pick up rather than a silently dropped message.
 */
export async function sendTemplatedEmail(
  db: any,
  input: {
    orgId: string;
    to: Recipient;
    category: EmailCategory;
    template: string;
    subject: string;
    html: string;
    relatedType?: string | null;
    relatedId?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<{ status: "sent" | "skipped" | "failed" | "suppressed"; id?: string; reason?: string }> {
  const to = input.to.email?.trim();

  const base = {
    org_id: input.orgId,
    user_id: input.to.id ?? null,
    to_email: to ?? "",
    category: input.category,
    template: input.template,
    subject: input.subject,
    body_html: input.html,
    related_type: input.relatedType ?? null,
    related_id: input.relatedId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  };

  if (!to) {
    await db.from("email_messages").insert({ ...base, status: "skipped", skip_reason: "no_address" });
    return { status: "skipped", reason: "no_address" };
  }

  if (optedOut(input.to, input.category)) {
    await db.from("email_messages").insert({ ...base, status: "skipped", skip_reason: "opted_out" });
    return { status: "skipped", reason: "opted_out" };
  }

  const { data: suppressed } = await db
    .from("email_suppressions")
    .select("reason")
    .eq("org_id", input.orgId)
    .ilike("email", to)
    .maybeSingle();
  if (suppressed) {
    await db.from("email_messages").insert({ ...base, status: "suppressed", skip_reason: suppressed.reason });
    return { status: "suppressed", reason: suppressed.reason };
  }

  const { data: row, error: insertError } = await db
    .from("email_messages")
    .insert({ ...base, status: "queued", attempts: 1 })
    .select("id")
    .single();

  // Unique violation on the idempotency key means someone already sent this.
  if (insertError) return { status: "skipped", reason: "duplicate" };

  return deliver(db, row.id, { to, subject: input.subject, html: input.html });
}

/** Shared by the first attempt and by the retry sweep. */
export async function deliver(
  db: any,
  messageId: string,
  msg: { to: string; subject: string; html: string },
): Promise<{ status: "sent" | "skipped" | "failed"; id: string; reason?: string }> {
  try {
    const result = await sendEmail({ to: msg.to, subject: msg.subject, html: msg.html });
    if ("skipped" in result) {
      await db
        .from("email_messages")
        .update({ status: "skipped", skip_reason: "no_api_key" })
        .eq("id", messageId);
      return { status: "skipped", id: messageId, reason: "no_api_key" };
    }
    await db
      .from("email_messages")
      .update({
        status: "sent",
        provider: "resend",
        provider_id: result.id,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", messageId);
    return { status: "sent", id: messageId };
  } catch (e) {
    await db
      .from("email_messages")
      .update({ status: "failed", error_message: String(e).slice(0, 500) })
      .eq("id", messageId);
    return { status: "failed", id: messageId, reason: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const emailTemplates = {
  escalation_assigned(v: {
    recipient: Recipient;
    commitmentTitle: string;
    ownerName: string;
    requesterName: string;
    dueDate: string;
    blocker: string;
    urgencyBand: string;
    urgencyRationale: string;
    escalationId: string;
  }) {
    const bandColour =
      v.urgencyBand === "critical" ? "#b91c1c" : v.urgencyBand === "high" ? "#c2410c" : "#374151";
    return {
      subject: `[${v.urgencyBand.toUpperCase()}] ${v.commitmentTitle} needs you`,
      html: layout({
        category: "escalation",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: v.commitmentTitle,
        intro: `${v.ownerName} is blocked and this has been routed to you.`,
        ctaLabel: "Open escalation",
        ctaPath: `/escalations/${v.escalationId}`,
        bodyHtml: `
<p style="margin:0 0 14px"><span style="color:${bandColour};font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.06em">${escapeHtml(v.urgencyBand)}</span> — ${escapeHtml(v.urgencyRationale)}</p>
${list([
          `Owed to <strong>${escapeHtml(v.requesterName)}</strong>`,
          `Due <strong>${escapeHtml(v.dueDate)}</strong>`,
          `Owner: <strong>${escapeHtml(v.ownerName)}</strong>`,
        ])}
<p style="margin:16px 0 0;padding:12px 14px;background:#f9fafb;border-left:3px solid #d1d5db"><em>"${escapeHtml(v.blocker)}"</em></p>`,
      }),
    };
  },

  escalation_queue_digest(v: {
    recipient: Recipient;
    items: Array<{ title: string; band: string; rationale: string; dueIn: string; id: string }>;
  }) {
    const rows = v.items
      .map(
        (i) =>
          `<tr>
<td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
<div style="font-weight:600"><a href="${APP_URL}/escalations/${i.id}" style="color:#0E1F1A;text-decoration:none">${escapeHtml(i.title)}</a></div>
<div style="font-size:13px;color:#6b7280">${escapeHtml(i.band)} · ${escapeHtml(i.dueIn)} · ${escapeHtml(i.rationale)}</div>
</td></tr>`,
      )
      .join("");
    return {
      subject: `${v.items.length} escalation${v.items.length === 1 ? "" : "s"} waiting on you`,
      html: layout({
        category: "escalation",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: "Your escalation queue",
        intro: "Ordered by urgency — most pressing first.",
        ctaLabel: "Open all escalations",
        ctaPath: "/escalations",
        bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
      }),
    };
  },

  survey_invite(v: { recipient: Recipient; scopeLabel: string; questionCount: number; cycleId: string }) {
    return {
      subject: `${v.questionCount} quick questions — ${v.scopeLabel}`,
      html: layout({
        category: "survey",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: `Today's check-in on ${v.scopeLabel}`,
        intro: `${v.questionCount} short questions about how the work is going. Answering is voluntary and takes a couple of minutes.`,
        ctaLabel: "Answer now",
        ctaPath: "/surveys/current",
        bodyHtml: `<p style="margin:0;color:#6b7280;font-size:13px">Your individual answers are never shown to your manager or to leadership. Only combined summaries across at least five people are reported.</p>`,
      }),
    };
  },

  survey_weekly_report(v: {
    recipient: Recipient;
    scopeLabel: string;
    periodLabel: string;
    bodyMarkdown: string;
    reportId: string;
  }) {
    return {
      subject: `Weekly team pulse — ${v.scopeLabel} (${v.periodLabel})`,
      html: layout({
        category: "report",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: `Weekly team pulse — ${v.scopeLabel}`,
        intro: v.periodLabel,
        ctaLabel: "Open full report",
        ctaPath: `/reports/${v.reportId}`,
        bodyHtml: preformatted(v.bodyMarkdown),
      }),
    };
  },

  project_pulse(v: { recipient: Recipient; projectName: string; projectId: string }) {
    return {
      subject: `How's ${v.projectName} going?`,
      html: layout({
        category: "project_pulse",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: `Quick update on ${v.projectName}`,
        intro: "Three things: where you are, anything blocking you, and anything you need.",
        ctaLabel: "Send update",
        ctaPath: `/projects/${v.projectId}`,
        bodyHtml: `<p style="margin:0;color:#6b7280;font-size:13px">This goes into the project's progress view so nobody has to chase you for a status in a meeting.</p>`,
      }),
    };
  },

  invite_user(v: {
    recipient: Recipient;
    orgName: string;
    role: string;
    inviterName: string;
    token: string;
  }) {
    return {
      subject: `Join ${v.orgName} on Company OS`,
      html: layout({
        category: "system",
        heading: `You're invited to ${v.orgName}`,
        intro: `${v.inviterName} invited you to join as ${v.role}.`,
        ctaLabel: "Accept invite",
        ctaPath: `/invite/${v.token}`,
        bodyHtml: `<p style="margin:0;color:#6b7280;font-size:13px">This link is for ${escapeHtml(v.recipient.email ?? "you")} only. If you were not expecting it, you can ignore this email.</p>`,
      }),
    };
  },

  report_ready(v: { recipient: Recipient; orgName: string; type: string; bodyMarkdown: string; reportId: string; pdfUrl?: string | null }) {
    return {
      subject: `Company OS ${v.type} report — ${v.orgName}`,
      html: layout({
        category: "report",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: `${v.type === "daily" ? "Daily" : "Weekly"} report`,
        intro: v.orgName,
        ctaLabel: v.pdfUrl ? "Download PDF" : "Open report",
        ctaPath: v.pdfUrl ? "" : `/reports/${v.reportId}`,
        bodyHtml:
          preformatted(v.bodyMarkdown) +
          (v.pdfUrl ? `<p style="margin:18px 0 0"><a href="${v.pdfUrl}" style="color:#0E1F1A">Download PDF</a></p>` : ""),
      }),
    };
  },
};
