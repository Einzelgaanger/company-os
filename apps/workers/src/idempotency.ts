import type { Redis } from "ioredis";
import { IDEMPOTENCY_TTL_SEC } from "./queues.js";

/**
 * Redis SETNX idempotency stub.
 * Returns true if this is the first time seeing the key (caller should proceed).
 * Returns false if the key already exists (skip — provider retry).
 */
export async function claimIdempotencyKey(
  redis: Redis,
  idempotencyKey: string,
  ttlSec: number = IDEMPOTENCY_TTL_SEC,
): Promise<boolean> {
  const key = `idempotency:${idempotencyKey}`;
  const result = await redis.set(key, "1", "EX", ttlSec, "NX");
  return result === "OK";
}
