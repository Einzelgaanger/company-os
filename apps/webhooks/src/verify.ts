/**
 * HMAC signature verification — no unsigned path in any environment.
 * Missing secret → caller must return 503 (not accept the body).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "invalid_signature" };

export function verifyHmacSha256(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
): VerifyResult {
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!signature) {
    return { ok: false, reason: "invalid_signature" };
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.replace(/^sha256=/, ""));
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ok: true };
    }
    return { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
}

/**
 * Twilio `X-Twilio-Signature` — HMAC-SHA1 of URL + sorted POST param key/value pairs.
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
  authToken: string | undefined,
): VerifyResult {
  if (!authToken?.trim()) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!signature) {
    return { ok: false, reason: "invalid_signature" };
  }
  const sorted = Object.keys(params).sort();
  let data = url;
  for (const key of sorted) data += key + params[key];
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ok: true };
    }
    return { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
}

/** Parse Twilio/Meta webhook bodies (form-urlencoded or JSON). */
export function parseWebhookParams(body: unknown): Record<string, string> {
  if (typeof body === "string") {
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(body)) out[k] = v;
    return out;
  }
  if (body && typeof body === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  }
  return {};
}
