import Fastify from "fastify";
import cors from "@fastify/cors";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractTraceId, newTraceId } from "@loop/shared";
import { parseOptInCommand, applyStopOptOut } from "@loop/messaging";
import { verifyHmacSha256, verifyTwilioSignature, parseWebhookParams } from "./verify.js";
import { isOptedOut, recordOptOut } from "./optOutLedger.js";

const PORT = Number(process.env.PORT ?? process.env.WEBHOOKS_PORT ?? 3002);
const HOST = process.env.WEBHOOKS_HOST ?? "0.0.0.0";
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

function redisConnection() {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
}

/** Map To-number / webhookId → tenantId. Never accept tenant from JSON body. */
function loadNumberRegistry(): Record<string, string> {
  const path =
    process.env.MESSAGING_NUMBERS_PATH ??
    join(process.cwd(), ".data", "messaging-numbers.json");
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveWhatsAppTenant(toNumber: string): string | null {
  const reg = loadNumberRegistry();
  const key = toNumber.trim().toLowerCase();
  return reg[key] ?? reg[toNumber] ?? process.env.DEV_WEBHOOK_TENANT_ID ?? null;
}

function resolveFathomTenant(webhookId: string): string | null {
  const reg = loadNumberRegistry();
  return (
    reg[`fathom:${webhookId}`] ?? process.env.DEV_WEBHOOK_TENANT_ID ?? null
  );
}

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: false });

  // Twilio posts application/x-www-form-urlencoded
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      const params: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(body as string)) params[k] = v;
      done(null, params);
    },
  );

  const connection = redisConnection();
  const ingestQueue = new Queue("ingest", { connection });

  app.get("/health", async () => ({ ok: true, service: "@loop/webhooks" }));

  app.post("/webhooks/whatsapp", async (request, reply) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const params = parseWebhookParams(request.body);
    const twilioSignature = request.headers["x-twilio-signature"] as string | undefined;
    const hubSignature = request.headers["x-hub-signature-256"] as string | undefined;

    let verified: { ok: boolean; reason?: string };
    if (twilioSignature) {
      const webhookUrl =
        process.env.PUBLIC_WEBHOOK_URL?.trim() ||
        `${request.protocol}://${request.headers.host}${request.url.split("?")[0]}`;
      verified = verifyTwilioSignature(webhookUrl, params, twilioSignature, authToken);
    } else if (hubSignature) {
      const raw =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? {});
      verified = verifyHmacSha256(
        raw,
        hubSignature,
        process.env.WHATSAPP_WEBHOOK_SECRET ?? authToken,
      );
    } else {
      verified = { ok: false, reason: "invalid_signature" };
    }

    if (!verified.ok) {
      if (verified.reason === "missing_secret") {
        request.log.error("TWILIO_AUTH_TOKEN not configured for WhatsApp webhook");
        return reply.code(503).send({ error: "webhook_misconfigured" });
      }
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const body = params as Record<string, unknown>;
    const providerId =
      String(body.MessageSid ?? body.message_id ?? body.id ?? "") ||
      `wa-${Date.now()}`;
    const text = String(body.Body ?? body.text ?? body.message ?? "");
    const from = String(body.From ?? body.from ?? "");
    const to = String(body.To ?? body.to ?? "");
    const tenantId = resolveWhatsAppTenant(to);
    if (!tenantId) {
      return reply.code(400).send({ error: "unknown_recipient_number" });
    }

    const traceId =
      extractTraceId(
        request.headers as Record<string, string | string[] | undefined>,
      ) || newTraceId();

    const cmd = parseOptInCommand(text);
    if (cmd.kind === "stop" && from) {
      // Persist BEFORE enqueue — restart must not re-enable (C-6).
      await recordOptOut(from);
      const patch = applyStopOptOut();
      await ingestQueue.add(
        "whatsapp-stop",
        {
          source: "whatsapp",
          kind: "opt_out_stop",
          tenantId,
          idempotency_key: `whatsapp:stop:${providerId}`,
          trace_id: traceId,
          from,
          patch,
          payload: body,
        },
        {
          jobId: `whatsapp:stop:${providerId}`,
          removeOnComplete: 1000,
        },
      );
      return reply.code(202).send({
        queued: true,
        stop: true,
        idempotency_key: `whatsapp:stop:${providerId}`,
        trace_id: traceId,
      });
    }

    if (from && isOptedOut(from)) {
      return reply.code(202).send({
        queued: false,
        ignored: "opted_out",
        trace_id: traceId,
      });
    }

    await ingestQueue.add(
      "whatsapp-inbound",
      {
        source: "whatsapp",
        tenantId,
        idempotency_key: `whatsapp:${providerId}`,
        trace_id: traceId,
        payload: body,
      },
      {
        jobId: `whatsapp:${providerId}`,
        removeOnComplete: 1000,
      },
    );

    return reply.code(202).send({
      queued: true,
      idempotency_key: `whatsapp:${providerId}`,
      trace_id: traceId,
    });
  });

  /** Fathom: tenant from opaque webhook path id, never body. */
  app.post<{ Params: { webhookId: string } }>(
    "/webhooks/fathom/:webhookId",
    async (request, reply) => {
      const secret = process.env.FATHOM_WEBHOOK_SECRET;
      const raw =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? {});
      const signature = request.headers["x-fathom-signature"] as
        | string
        | undefined;

      const verified = verifyHmacSha256(raw, signature, secret);
      if (!verified.ok) {
        if (verified.reason === "missing_secret") {
          return reply.code(503).send({ error: "webhook_misconfigured" });
        }
        return reply.code(401).send({ error: "invalid_signature" });
      }

      const tenantId = resolveFathomTenant(request.params.webhookId);
      if (!tenantId) {
        return reply.code(404).send({ error: "unknown_webhook" });
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      const providerId =
        String(body.id ?? body.recording_id ?? body.event_id ?? "") ||
        `fathom-${Date.now()}`;
      const traceId = extractTraceId(
        request.headers as Record<string, string | string[] | undefined>,
      );

      await ingestQueue.add(
        "fathom-meeting",
        {
          source: "fathom",
          tenantId,
          idempotency_key: `fathom:${providerId}`,
          trace_id: traceId,
          payload: body,
        },
        {
          jobId: `fathom:${providerId}`,
          removeOnComplete: 1000,
        },
      );

      return reply
        .code(202)
        .send({
          queued: true,
          idempotency_key: `fathom:${providerId}`,
          trace_id: traceId,
        });
    },
  );

  /** Legacy path removed — tenant must never be taken from the JSON body. */
  app.post("/webhooks/fathom", async (_request, reply) => {
    return reply.code(410).send({
      error: "gone",
      message: "Use /webhooks/fathom/:webhookId — tenant is never taken from the body",
    });
  });

  app.post("/webhooks/email", async (_request, reply) => {
    if (process.env.FEATURE_EMAIL_INGESTION !== "true") {
      return reply.code(403).send({
        error: "email_ingestion_disabled",
        message: "C-5: email_ingestion flag is off",
      });
    }
    return reply.code(501).send({ status: "not_implemented" });
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`@loop/webhooks listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
