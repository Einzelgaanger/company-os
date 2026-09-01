import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmacSha256, verifyTwilioSignature } from "./verify.js";

describe("verifyHmacSha256", () => {
  it("accepts matching sha256 hex", () => {
    const body = '{"ok":true}';
    const secret = "test-secret";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyHmacSha256(body, sig, secret)).toEqual({ ok: true });
    expect(verifyHmacSha256(body, `sha256=${sig}`, secret)).toEqual({ ok: true });
  });

  it("rejects mismatch", () => {
    expect(verifyHmacSha256("a", "deadbeef", "secret").ok).toBe(false);
  });

  it("never allows unsigned — missing secret is missing_secret", () => {
    expect(verifyHmacSha256("x", undefined, undefined)).toEqual({
      ok: false,
      reason: "missing_secret",
    });
  });
});

describe("verifyTwilioSignature", () => {
  it("accepts Twilio-style X-Twilio-Signature", () => {
    const url = "https://example.com/webhooks/whatsapp";
    const params = { Body: "hello", From: "whatsapp:+254700000001", To: "whatsapp:+14155551234" };
    const token = "twilio-auth-token";
    const sorted = Object.keys(params).sort();
    let data = url;
    for (const key of sorted) data += key + params[key as keyof typeof params];
    const sig = createHmac("sha1", token).update(data, "utf8").digest("base64");
    expect(verifyTwilioSignature(url, params, sig, token)).toEqual({ ok: true });
  });
});
