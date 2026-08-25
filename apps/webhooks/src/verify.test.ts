import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmacSha256 } from "./verify.js";

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
