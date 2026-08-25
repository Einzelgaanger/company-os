import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import { oauthEnvStatus } from "../lib/oauth.js";
import { tokenEncryptionConfigured } from "../lib/tokenCrypto.js";
import { workosConfigured } from "../lib/workos.js";
import { ensureSeedUsers } from "../store/memory.js";
import { readCompliance, writeCompliance } from "../store/legal.js";

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_NUMBER?.trim(),
  );
}

function resolveMessagingMode(tenantMode?: string | null): string {
  const m = (tenantMode ?? process.env.MESSAGING_MODE ?? "in_app").toLowerCase();
  if (m === "live" || m === "sandbox" || m === "in_app") return m;
  return "in_app";
}

/**
 * Launch readiness — ODPC / Meta / Twilio / OAuth / WorkOS evidence status.
 * Never invents "approved"; only reports configured vs missing / manual fields.
 */
export async function launchRoutes(app: FastifyInstance) {
  bindRoute("/settings/launch", "GET", "compliance.attest");
  bindRoute("/settings/launch", "PATCH", "compliance.attest");

  app.get("/settings/launch", { preHandler: [app.authenticate] }, async (req) => {
    await ensureSeedUsers();
    const compliance = await readCompliance(req.auth!.tenantId);
    const payload = (compliance?.payload ?? {}) as Record<string, unknown>;
    const messagingMode = resolveMessagingMode(
      typeof payload.messaging_mode === "string" ? payload.messaging_mode : null,
    );

    const google = oauthEnvStatus("google_calendar");
    const microsoft = oauthEnvStatus("microsoft_calendar");

    return {
      odpc: {
        status: payload.odpc_registration_ref ? "recorded" : "missing",
        registrationRef: payload.odpc_registration_ref ?? null,
        registeredAt: payload.odpc_registered_at ?? null,
        note: "Enter the real ODPC registration reference after filing — Loop does not invent approval.",
      },
      meta: {
        businessVerified: payload.meta_business_verified === true,
        wabaIdConfigured: Boolean(process.env.META_WABA_ID?.trim()),
        note: "Meta Business verification is external. Mark verified only after Meta confirms.",
      },
      messaging: {
        mode: messagingMode,
        twilioConfigured: twilioConfigured(),
        liveReady: messagingMode === "live" && twilioConfigured(),
        note:
          messagingMode === "live" && !twilioConfigured()
            ? "live mode is selected but Twilio env is incomplete — sends will fail loudly."
            : null,
      },
      oauth: {
        googleCalendar: google,
        microsoftCalendar: microsoft,
        tokenEncryption: tokenEncryptionConfigured(),
      },
      workos: {
        configured: workosConfigured(),
        missing: workosConfigured()
          ? []
          : ["WORKOS_API_KEY", "WORKOS_CLIENT_ID"].filter(
              (k) => !process.env[k]?.trim(),
            ),
      },
      compliance: {
        attested: Boolean(compliance?.attestedAt),
        attestedAt: compliance?.attestedAt ?? null,
      },
    };
  });

  app.patch("/settings/launch", { preHandler: [app.authenticate] }, async (req, reply) => {
    await ensureSeedUsers();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const existing = await readCompliance(req.auth!.tenantId);
    if (!existing) {
      return reply.code(409).send({
        error: "compliance_not_attested",
        hint: "Complete onboarding compliance attestation first.",
      });
    }
    const payload = { ...existing.payload };
    if (typeof body.odpc_registration_ref === "string") {
      payload.odpc_registration_ref = body.odpc_registration_ref.trim() || null;
      payload.odpc_registered_at = body.odpc_registration_ref
        ? new Date().toISOString()
        : null;
    }
    if (typeof body.meta_business_verified === "boolean") {
      payload.meta_business_verified = body.meta_business_verified;
    }
    if (
      body.messaging_mode === "live" ||
      body.messaging_mode === "in_app" ||
      body.messaging_mode === "sandbox"
    ) {
      payload.messaging_mode = body.messaging_mode;
    }
    await writeCompliance({
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      payload,
    });
    return { ok: true, payload };
  });
}
