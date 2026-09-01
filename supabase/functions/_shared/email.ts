// Transactional email via Resend (optional — skips when RESEND_API_KEY unset).
import { getSecret } from "./secrets.ts";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ id: string } | { skipped: true }> {
  const apiKey = await getSecret("RESEND_API_KEY");
  if (!apiKey) return { skipped: true };

  const from =
    input.from ||
    (await getSecret("REPORT_FROM_ADDRESS")) ||
    "Loop <noreply@loop.app>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { id: String(data.id ?? "sent") };
}
