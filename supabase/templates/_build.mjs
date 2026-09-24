import fs from "fs";

const APP = "https://os.jabali.studio";
const FONT = "'Instrument Sans','Segoe UI',Helvetica,Arial,sans-serif";

function page({ title, heading, intro, body, cta, href, note }) {
  const button =
    cta && href
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px"><tr><td bgcolor="#D3F36B" style="border-radius:999px;background:#D3F36B"><a href="${href}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#0E1F1A;text-decoration:none;border-radius:999px;background:#D3F36B">${cta}</a></td></tr></table>`
      : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#F4F5F3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${intro}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F3;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #E5E5E2;border-radius:20px;overflow:hidden;font-family:${FONT};color:#0E1F1A">
<tr><td style="background:#0E1F1A;padding:22px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px"><img src="${APP}/email-mark.png" width="40" height="40" alt="Company OS" style="display:block;border:0;border-radius:10px;width:40px;height:40px"></td>
<td><div style="font-size:16px;font-weight:700;color:#F4F5F3">Company OS</div><div style="font-size:12px;font-weight:600;color:#D3F36B;margin-top:2px">Your Agentic Chief Of Staff</div></td>
</tr></table></td></tr>
<tr><td style="height:4px;background:#D3F36B;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 0"><h1 style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.03em;line-height:1.2;color:#0E1F1A">${heading}</h1></td></tr>
<tr><td style="padding:12px 28px 0"><p style="margin:0;font-size:16px;line-height:1.6;color:#5B6560">${intro}</p></td></tr>
<tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.65;color:#24312C">${body}${button}</td></tr>
<tr><td style="padding:22px 28px 26px"><p style="margin:0;font-size:12px;line-height:1.5;color:#9AA39E">${note}</p></td></tr>
</table></td></tr></table></body></html>
`;
}

const files = {
  confirmation: page({
    title: "Confirm your email",
    heading: "Welcome to Company OS",
    intro: "Confirm your email to open your workspace.",
    body: '<p style="margin:0">One click and you can start capturing commitments, check-ins and the operating picture your leads already wish they had.</p>',
    cta: "Confirm email",
    href: "{{ .ConfirmationURL }}",
    note: "If you did not create a Company OS account, you can ignore this email.",
  }),
  recovery: page({
    title: "Reset your password",
    heading: "Reset your password",
    intro: "We received a request to set a new password for your Company OS account.",
    body: '<p style="margin:0">This link expires soon. If you did not ask for a reset, you can ignore this email and your password will stay the same.</p>',
    cta: "Choose a new password",
    href: "{{ .ConfirmationURL }}",
    note: "Sent to {{ .Email }}.",
  }),
  magic_link: page({
    title: "Your sign-in link",
    heading: "Sign in to Company OS",
    intro: "Use the button below to sign in. No password needed.",
    body: '<p style="margin:0">This link is only for you and expires shortly.</p>',
    cta: "Sign in",
    href: "{{ .ConfirmationURL }}",
    note: "If you did not request this, you can ignore this email.",
  }),
  invite: page({
    title: "You are invited",
    heading: "You are invited to Company OS",
    intro: "Someone invited you to join their workspace.",
    body: '<p style="margin:0">Accept the invite to set your password and start.</p>',
    cta: "Accept invite",
    href: "{{ .ConfirmationURL }}",
    note: "If you were not expecting this, you can ignore this email.",
  }),
  email_change: page({
    title: "Confirm your new email",
    heading: "Confirm your new email",
    intro: "Confirm this address so Company OS can use it for your account.",
    body: '<p style="margin:0">If you did not ask to change your email, ignore this message.</p>',
    cta: "Confirm new email",
    href: "{{ .ConfirmationURL }}",
    note: "Sent to {{ .Email }}.",
  }),
  reauthentication: page({
    title: "Your verification code",
    heading: "Confirm it is you",
    intro: "Enter this code to continue.",
    body: '<p style="margin:16px 0 0;font-size:32px;font-weight:700;letter-spacing:0.18em;color:#0E1F1A">{{ .Token }}</p>',
    cta: "",
    href: "",
    note: "If you did not request this code, you can ignore this email.",
  }),
};

for (const [name, html] of Object.entries(files)) {
  fs.writeFileSync(new URL(`./${name}.html`, import.meta.url), html);
}
console.log(Object.keys(files).join(","));
