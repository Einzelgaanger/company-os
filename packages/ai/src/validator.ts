/**
 * Validator — deterministic code, no model (C-4).
 * Resolve names → user IDs; reject URLs / phones in model output.
 */

export type RosterUser = {
  id: string;
  fullName: string;
  email: string;
  firstName?: string;
};

export type NameResolution =
  | { status: "resolved"; userId: string; confidence: number; method: string }
  | { status: "unresolved"; reason: string };

const URL_RE = /https?:\/\/|www\./i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/;

export function containsForbiddenContactData(text: string): boolean {
  if (!text) return false;
  if (URL_RE.test(text)) return true;
  if (EMAIL_RE.test(text)) return true;
  // Require enough digits to avoid matching dates like 2026-08-24
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 10 && PHONE_RE.test(text)) return true;
  return false;
}

/** Tripwire: discard entire extraction if any free-text field trips. */
export function rejectUnsafeOutputFields(
  fields: Array<string | null | undefined>,
): { ok: true } | { ok: false; fieldIndex: number; sample: string } {
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f && containsForbiddenContactData(f)) {
      return { ok: false, fieldIndex: i, sample: f.slice(0, 80) };
    }
  }
  return { ok: true };
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a name against the tenant roster.
 * exact email > exact full name > unique first-name > (fuzzy later).
 */
export function resolveNameToUserId(
  name: string | null | undefined,
  roster: RosterUser[],
  participantUserIds?: Set<string>,
): NameResolution {
  if (!name?.trim()) {
    return { status: "unresolved", reason: "empty_name" };
  }
  const n = norm(name);

  const byEmail = roster.find((u) => norm(u.email) === n);
  if (byEmail) {
    return {
      status: "resolved",
      userId: byEmail.id,
      confidence: 1,
      method: "exact_email",
    };
  }

  const byFull = roster.filter((u) => norm(u.fullName) === n);
  if (byFull.length === 1) {
    return {
      status: "resolved",
      userId: byFull[0].id,
      confidence: 0.95,
      method: "exact_full_name",
    };
  }

  const byFirst = roster.filter((u) => {
    const first = norm(u.firstName ?? u.fullName.split(/\s+/)[0] ?? "");
    return first === n;
  });
  const scoped = participantUserIds
    ? byFirst.filter((u) => participantUserIds.has(u.id))
    : byFirst;
  if (scoped.length === 1) {
    return {
      status: "resolved",
      userId: scoped[0].id,
      confidence: 0.85,
      method: "unique_first_name",
    };
  }

  return { status: "unresolved", reason: "no_confident_match" };
}
