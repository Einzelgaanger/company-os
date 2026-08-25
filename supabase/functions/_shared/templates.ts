// WhatsApp message templates (BUILD_SPEC Section 9). Variables in {braces}.
export const templates = {
  "W-PROGRESS": (v: { first_name: string; project_name: string }) =>
    `Hi ${v.first_name}, quick check on *${v.project_name}* — how's it going, and anything blocking you?`,
  "W-FOLLOWUP": (v: { first_name: string; commitment_title: string; requester_name: string; due_date: string }) =>
    `Hi ${v.first_name}, following up on *${v.commitment_title}*, which ${v.requester_name} needs by ${v.due_date}. Has this been shared / done yet?`,
  "W-CLARIFY": (v: { commitment_title: string }) =>
    `Just to confirm — is *${v.commitment_title}* done, in progress, or blocked on something?`,
  "W-BUNDLE": (v: { first_name: string; list_of_titles: string }) =>
    `Hi ${v.first_name}, a few things due today: ${v.list_of_titles}. Quick status on each?`,
  "W-ESCALATE": (v: { escalated_to_name: string; commitment_title: string; requester_name: string; due_date: string; owner_name: string; blocker_text: string }) =>
    `Hi ${v.escalated_to_name}, *${v.commitment_title}* (owed to ${v.requester_name}, due ${v.due_date}) is still pending with ${v.owner_name}. They said: "${v.blocker_text}". Can you help unblock this?`,
  "W-CONFIRM": (v: { commitment_title: string; resolution_summary: string }) =>
    `Update on *${v.commitment_title}*: ${v.resolution_summary}.`,
  "W-DAILY-PULSE": (v: { first_name: string }) =>
    `Hi ${v.first_name}, what are you focused on today, and is anything in your way?`,
  "W-STANDUP-PREP": (v: { team_name: string; on_track: number; blocked: number; overdue: number; link_to_dashboard: string }) =>
    `Standup snapshot for ${v.team_name}: ${v.on_track} on track, ${v.blocked} blocked, ${v.overdue} overdue. Full detail: ${v.link_to_dashboard}.`,
  "W-OTP": (v: { code: string }) =>
    `Your Loop verification code is ${v.code}. It expires in 10 minutes.`,
};
