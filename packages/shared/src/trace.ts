/**
 * Trace / correlation IDs — Phase 0 exit: HTTP → queue reconstructable.
 */
import { randomBytes } from "node:crypto";

export function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function extractTraceId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const raw =
    headers["x-trace-id"] ??
    headers["x-request-id"] ??
    headers["x-correlation-id"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && /^[a-f0-9-]{8,64}$/i.test(v)) return v;
  return newTraceId();
}

export type TracedJobPayload = {
  trace_id: string;
  tenantId?: string | null;
  idempotency_key: string;
};
