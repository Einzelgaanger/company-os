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
