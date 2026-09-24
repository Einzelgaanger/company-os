// AES-256-GCM envelope for connector credentials on the Supabase plane.
//
// Wire format is identical to the Fastify plane (apps/api/src/lib/tokenCrypto.ts):
//   <iv hex>:<tag hex>:<ciphertext hex>
// so a database written by either stack is readable by the other.
//
// Key material comes from TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes, or any
// passphrase, which is SHA-256'd into a key). A missing key is an error, never a
// silent fall back to plaintext.
import { getSecret } from "./secrets.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();
const ENVELOPE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i;

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => Uint8Array.from(value.match(/../g)!.map((h) => parseInt(h, 16)));

async function keyBytes(): Promise<Uint8Array> {
  const raw = (await getSecret("TOKEN_ENCRYPTION_KEY")) ?? (await getSecret("KMS_KEY_ID"));
  if (!raw) throw new Error("token_encryption_not_configured");
  return /^[0-9a-fA-F]{64}$/.test(raw)
    ? fromHex(raw)
    : new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(raw)));
}

async function key(usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", await keyBytes(), "AES-GCM", false, [usage]);
}

/** True when the plane is able to store credentials at all. */
export async function tokenEncryptionConfigured(): Promise<boolean> {
  return Boolean((await getSecret("TOKEN_ENCRYPTION_KEY")) ?? (await getSecret("KMS_KEY_ID")));
}

export async function encryptToken(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      await key("encrypt"),
      enc.encode(plaintext),
    ),
  );
  // WebCrypto appends the 16-byte tag to the ciphertext; Node keeps it separate.
  return `${toHex(iv)}:${toHex(sealed.slice(sealed.length - 16))}:${toHex(sealed.slice(0, sealed.length - 16))}`;
}

/**
 * Decrypts a stored credential. Values that are not in envelope format are
 * returned unchanged: rows written before encryption shipped stay usable, and
 * they get re-encrypted the next time the connector refreshes.
 */
export async function decryptToken(stored: string): Promise<string> {
  if (!ENVELOPE.test(stored)) return stored;
  const [ivHex, tagHex, dataHex] = stored.split(":");
  const sealed = new Uint8Array([...fromHex(dataHex), ...fromHex(tagHex)]);
  const open = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(ivHex), tagLength: 128 },
    await key("decrypt"),
    sealed,
  );
  return dec.decode(open);
}
