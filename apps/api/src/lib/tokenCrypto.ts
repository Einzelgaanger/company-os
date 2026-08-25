/**
 * Envelope encryption for OAuth tokens (09_CONNECTORS §9.2).
 * Uses TOKEN_ENCRYPTION_KEY (32-byte hex or base64) or derives from KMS_KEY_ID
 * as local AES-256-GCM key material. Missing key → refuse live token storage.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function tokenEncryptionConfigured(): boolean {
  return Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim() || process.env.KMS_KEY_ID?.trim());
}

function masterKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim() || process.env.KMS_KEY_ID?.trim();
  if (!raw) {
    throw new Error("token_encryption_not_configured");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(raw).digest();
}

/** Returns ciphertext as `iv:tag:data` hex. */
export function encryptToken(plaintext: string): string {
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(blob: string): string {
  const [ivHex, tagHex, dataHex] = blob.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("invalid_token_blob");
  const key = masterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptTokenToBuffer(plaintext: string): Buffer {
  return Buffer.from(encryptToken(plaintext), "utf8");
}

export function decryptTokenFromBuffer(buf: Buffer): string {
  return decryptToken(buf.toString("utf8"));
}
