/**
 * Eligibility gate — 06_WHATSAPP §6.3.
 * Every check must pass; failing any gate reschedules (not an error).
 */

export type EligibilityUser = {
  status: string;
  noticeAcknowledgedAt: Date | string | null;
  whatsappOptInAt: Date | string | null;
  whatsappOptOutAt: Date | string | null;
  phoneVerifiedAt: Date | string | null;
};

export type EligibilityTenantSettings = {
  timezone: string;
  /** ISO weekdays 1=Mon .. 7=Sun */
  workDays: number[];
  quietHoursStart: string; // "HH:MM"
  quietHoursEnd: string;
  maxCheckinsPerPersonPerDay: number;
};

export type EligibilityCommitment = {
  reviewRequired: boolean;
};

export type EligibilityContext = {
  user: EligibilityUser;
  tenant: EligibilityTenantSettings;
  commitment: EligibilityCommitment;
  /** Messages already sent to this person today (check-in class). */
  checkinsSentToPersonToday: number;
  /** Whether a message was sent to this person about this commitment in last 24h. */
  messagedAboutCommitmentWithin24h: boolean;
  /** Instant to evaluate (defaults to now). */
  now?: Date;
};

export type EligibilityFailure =
  | "user_not_active"
  | "notice_not_acknowledged"
  | "whatsapp_not_opted_in"
  | "whatsapp_opted_out"
  | "phone_not_verified"
  | "outside_working_window"
  | "max_checkins_per_day"
  | "recent_message_same_commitment"
  | "commitment_review_required";

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reason: EligibilityFailure };

function isPresent(v: Date | string | null | undefined): boolean {
  return v != null && v !== "";
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((x) => Number(x));
  return { h: h || 0, m: m || 0 };
}

/**
 * Working-days + quiet-hours in the tenant timezone via Intl (no luxon).
 */
export function isWithinWorkingWindow(
  tenant: EligibilityTenantSettings,
  now: Date,
): boolean {
  const tz = tenant.timezone || "UTC";
  let local: Date;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const isoDay =
      { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] ??
      (now.getUTCDay() === 0 ? 7 : now.getUTCDay());
    if (!tenant.workDays.includes(isoDay)) return false;

    const minutes = hour * 60 + minute;
    const start = parseHm(tenant.quietHoursStart);
    const end = parseHm(tenant.quietHoursEnd);
    const quietStart = start.h * 60 + start.m;
    const quietEnd = end.h * 60 + end.m;
    const inQuiet =
      quietStart > quietEnd
        ? minutes >= quietStart || minutes < quietEnd
        : minutes >= quietStart && minutes < quietEnd;
    return !inQuiet;
  } catch {
    local = now;
    const day = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
    if (!tenant.workDays.includes(day)) return false;
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const start = parseHm(tenant.quietHoursStart);
    const end = parseHm(tenant.quietHoursEnd);
    const quietStart = start.h * 60 + start.m;
    const quietEnd = end.h * 60 + end.m;
    const inQuiet =
      quietStart > quietEnd
        ? minutes >= quietStart || minutes < quietEnd
        : minutes >= quietStart && minutes < quietEnd;
    return !inQuiet;
  }
}

/** The eight checks from §6.3 — all must pass. */
export function eligibilityGate(ctx: EligibilityContext): EligibilityResult {
  const now = ctx.now ?? new Date();

  // 1. users.status = 'active'
  if (ctx.user.status !== "active") {
    return { ok: false, reason: "user_not_active" };
  }

  // 2. notice_acknowledged_at IS NOT NULL (C-3)
  if (!isPresent(ctx.user.noticeAcknowledgedAt)) {
    return { ok: false, reason: "notice_not_acknowledged" };
  }

  // 3. whatsapp_opt_in_at IS NOT NULL and whatsapp_opt_out_at IS NULL
  if (!isPresent(ctx.user.whatsappOptInAt)) {
    return { ok: false, reason: "whatsapp_not_opted_in" };
  }
  if (isPresent(ctx.user.whatsappOptOutAt)) {
    return { ok: false, reason: "whatsapp_opted_out" };
  }

  // 4. phone_verified_at IS NOT NULL
  if (!isPresent(ctx.user.phoneVerifiedAt)) {
    return { ok: false, reason: "phone_not_verified" };
  }

  // 5. Within tenant working days and outside quiet hours
  if (!isWithinWorkingWindow(ctx.tenant, now)) {
    return { ok: false, reason: "outside_working_window" };
  }

  // 6. Under max_checkins_per_person_per_day
  if (ctx.checkinsSentToPersonToday >= ctx.tenant.maxCheckinsPerPersonPerDay) {
    return { ok: false, reason: "max_checkins_per_day" };
  }

  // 7. No message about this commitment in the last 24h
  if (ctx.messagedAboutCommitmentWithin24h) {
    return { ok: false, reason: "recent_message_same_commitment" };
  }

  // 8. Commitment is not review_required
  if (ctx.commitment.reviewRequired) {
    return { ok: false, reason: "commitment_review_required" };
  }

  return { ok: true };
}
