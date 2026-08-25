/** Queue names + concurrency from 01_ARCHITECTURE §1.4 */
export const QUEUE_NAMES = [
  "ingest",
  "extract",
  "classify",
  "outbound-whatsapp",
  "escalate",
  "survey",
  "report",
  "housekeeping",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  ingest: 20,
  extract: 10,
  classify: 30,
  /** Rate-limited separately; concurrency is a soft cap under the 80/s limiter. */
  "outbound-whatsapp": 10,
  escalate: 10,
  survey: 10,
  report: 5,
  housekeeping: 5,
};

export const QUEUE_ATTEMPTS: Record<QueueName, number> = {
  ingest: 5,
  extract: 3,
  classify: 3,
  "outbound-whatsapp": 5,
  escalate: 3,
  survey: 3,
  report: 3,
  housekeeping: 2,
};

export const OUTBOUND_WHATSAPP_LIMITER = {
  max: Number(process.env.WHATSAPP_GLOBAL_RATE_LIMIT_PER_SEC ?? 80),
  duration: 1000,
} as const;

export const IDEMPOTENCY_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
