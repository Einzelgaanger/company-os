// Templated email with delivery logging, preference and suppression checks.
// Branded shell, sent through Resend on the verified domain.
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

const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://os.jabali.studio";

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT = "'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif";
const FOREST = "#0E1F1A";
const LIME = "#D3F36B";
const PAPER = "#F4F5F3";
const MUTED = "#5B6560";
const LOGO = `${APP_URL}/email-mark.png`;

/**
 * Branded shell for every product email. Styles are inline because most
 * clients drop stylesheets. Instrument Sans loads where the client allows it.
 */
export function layout(input: {
  heading: string;
  intro?: string;
  preheader?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaPath?: string;
  /** Absolute URL. Used instead of ctaPath when the link is not on this app. */
  ctaHref?: string;
  unsubscribeToken?: string | null;
  category: EmailCategory;
}): string {
  const href = input.ctaHref || (input.ctaPath ? `${APP_URL}${input.ctaPath}` : "");
  const cta =
    input.ctaLabel && href
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px"><tr><td bgcolor="${LIME}" style="border-radius:999px;background:${LIME}"><a href="${href}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${FOREST};text-decoration:none;border-radius:999px;background:${LIME}">${escapeHtml(input.ctaLabel)}</a></td></tr></table>`
      : "";

  const unsubscribe =
    input.unsubscribeToken && !MANDATORY.includes(input.category)
      ? `<a href="${APP_URL}/email/unsubscribe?token=${input.unsubscribeToken}&category=${input.category}" style="color:#9AA39E;text-decoration:underline">Turn off ${input.category.replace("_", " ")} email</a><span style="color:#5C675F"> · </span>`
      : "";

  const preview = input.preheader || input.intro || input.heading;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #E5E5E2;border-radius:20px;overflow:hidden;font-family:${FONT};color:${FOREST}">
<tr><td style="background:${FOREST};padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;padding-right:12px"><img src="${LOGO}" width="40" height="40" alt="Company OS" style="display:block;border:0;border-radius:10px;width:40px;height:40px"></td>
<td style="vertical-align:middle">
<div style="font-family:${FONT};font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#F4F5F3">Company OS</div>
<div style="font-family:${FONT};font-size:12px;font-weight:600;color:${LIME};margin-top:2px">Your Agentic Chief Of Staff</div>
</td>
</tr></table>
</td></tr>
<tr><td style="height:4px;background:${LIME};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 0">
<h1 style="margin:0;font-family:${FONT};font-size:26px;font-weight:700;letter-spacing:-0.03em;line-height:1.2;color:${FOREST}">${escapeHtml(input.heading)}</h1>
</td></tr>
${input.intro ? `<tr><td style="padding:12px 28px 0"><p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${MUTED}">${escapeHtml(input.intro)}</p></td></tr>` : ""}
<tr><td style="padding:18px 28px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:#24312C">${input.bodyHtml}</td></tr>
<tr><td style="padding:0 28px 8px">${cta}</td></tr>
<tr><td style="padding:22px 28px 26px">
<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.5;color:#9AA39E">Company OS keeps follow-through alive so people are not left chasing.</p>
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:#9AA39E">${unsubscribe}<a href="${APP_URL}/settings/profile" style="color:#9AA39E;text-decoration:underline">Notification settings</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
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

const KIND_CATEGORY: Record<string, EmailCategory> = {
  escalation: "escalation",
  report: "report",
  connection_error: "system",
  system: "system",
};

/**
 * Branded Resend mail for an in-app notification. Skips quietly when the
 * person has no address, opted out, or is suppressed.
 */
export async function emailUserNotice(
  db: any,
  input: {
    orgId: string;
    userId: string;
    title: string;
    body: string;
    link?: string | null;
    kind?: string;
    category?: EmailCategory;
    template?: string;
  },
): Promise<{ status: string; reason?: string }> {
  const { data: user } = await db
    .from("users")
    .select("id, email, full_name, email_prefs, email_unsubscribe_token")
    .eq("id", input.userId)
    .maybeSingle();
  if (!user?.email) return { status: "skipped", reason: "no_address" };

  const category = input.category ?? KIND_CATEGORY[input.kind ?? "system"] ?? "system";
  const mail = emailTemplates.notice({
    recipient: user,
    category,
    title: input.title,
    body: input.body,
    link: input.link,
  });
  return sendTemplatedEmail(db, {
    orgId: input.orgId,
    to: user,
    category,
    template: input.template ?? "notice",
    subject: mail.subject,
    html: mail.html,
  });
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
<p style="margin:0 0 14px"><span style="color:${bandColour};font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.06em">${escapeHtml(v.urgencyBand)}</span> Ã¢ÂÂ ${escapeHtml(v.urgencyRationale)}</p>
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
<div style="font-size:13px;color:#6b7280">${escapeHtml(i.band)} Ã· ${escapeHtml(i.dueIn)} Ã· ${escapeHtml(i.rationale)}</div>
</td></tr>`,
      )
      .join("");
    return {
      subject: `${v.items.length} escalation${v.items.length === 1 ? "" : "s"} waiting on you`,
      html: layout({
        category: "escalation",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: "Your escalation queue",
        intro: "Ordered by urgency Ã¢ÂÂ most pressing first.",
        ctaLabel: "Open all escalations",
        ctaPath: "/escalations",
        bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
      }),
    };
  },

  survey_invite(v: { recipient: Recipient; scopeLabel: string; questionCount: number; cycleId: string }) {
    return {
      subject: `${v.questionCount} quick questions Ã¢ÂÂ ${v.scopeLabel}`,
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
      subject: `Weekly team pulse Ã¢ÂÂ ${v.scopeLabel} (${v.periodLabel})`,
      html: layout({
        category: "report",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: `Weekly team pulse Ã¢ÂÂ ${v.scopeLabel}`,
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

  checkin(v: { recipient: Recipient; title: string; body: string; link?: string }) {
    return {
      subject: v.title,
      html: layout({
        category: "checkin",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: v.title,
        intro: "A short note about work you own.",
        ctaLabel: "Open it",
        ctaPath: v.link || "/my-work",
        bodyHtml: `<p style="margin:0">${escapeHtml(v.body)}</p>`,
      }),
    };
  },

  digest(v: { recipient: Recipient; body: string }) {
    return {
      subject: "Your Company OS morning digest",
      html: layout({
        category: "digest",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: "Morning digest",
        intro: "What is overdue, due today, and coming up.",
        ctaLabel: "Open commitments",
        ctaPath: "/commitments",
        bodyHtml: preformatted(v.body),
      }),
    };
  },

  /** Any in-app notification that does not have a more specific template. */
  notice(v: {
    recipient: Recipient;
    category: EmailCategory;
    title: string;
    body: string;
    link?: string | null;
  }) {
    return {
      subject: v.title,
      html: layout({
        category: v.category,
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: v.title,
        ctaLabel: v.link ? "Open in Company OS" : undefined,
        ctaPath: v.link || undefined,
        bodyHtml: `<p style="margin:0">${escapeHtml(v.body)}</p>`,
      }),
    };
  },

  report_ready(v: { recipient: Recipient; orgName: string; type: string; bodyMarkdown: string; reportId: string; pdfUrl?: string | null }) {
    return {
      subject: `Company OS ${v.type} report Ã¢ÂÂ ${v.orgName}`,
      html: layout({
        category: "report",
        unsubscribeToken: v.recipient.email_unsubscribe_token,
        heading: `${v.type === "daily" ? "Daily" : "Weekly"} report`,
        intro: v.orgName,
        ctaLabel: v.pdfUrl ? "Download PDF" : "Open report",
        ctaPath: v.pdfUrl ? undefined : `/reports/${v.reportId}`,
        ctaHref: v.pdfUrl || undefined,
        bodyHtml:
          preformatted(v.bodyMarkdown) +
          (v.pdfUrl ? `<p style="margin:18px 0 0"><a href="${v.pdfUrl}" style="color:#0E1F1A">Download PDF</a></p>` : ""),
      }),
    };
  },
};
