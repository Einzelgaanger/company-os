// launch-readiness — env + org settings status for Supabase production pilot.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";

function envConfigured(keys: string[]): { configured: boolean; missing: string[] } {
  const missing = keys.filter((k) => !Deno.env.get(k)?.trim());
  return { configured: missing.length === 0, missing };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("org_id");
    let settings: Record<string, unknown> = {};
    if (orgId) {
      const { data: org } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
      settings = (org?.settings ?? {}) as Record<string, unknown>;
    }

    const openRouter = Boolean(await getSecret("OPENROUTER_API_KEY"));
    const metaWaba = Boolean(
      (await getSecret("META_WABA_ID")) || (await getSecret("WHATSAPP_WABA_ID")),
    );
    const whatsappToken = Boolean(await getSecret("WHATSAPP_ACCESS_TOKEN"));

    return json({
      odpc: {
        status: settings.odpc_registration_ref ? "recorded" : "missing",
        registrationRef: settings.odpc_registration_ref ?? null,
        note: "Enter the real ODPC registration reference after filing.",
      },
      meta: {
        businessVerified: settings.meta_business_verified === true,
        wabaIdConfigured: metaWaba,
        whatsappTokenConfigured: whatsappToken,
        note: "Mark verified only after Meta Business confirms.",
      },
      messaging: {
        mode: settings.messaging_mode ?? "live",
        metaConfigured: whatsappToken && metaWaba,
        twilioConfigured: envConfigured([
          "TWILIO_ACCOUNT_SID",
          "TWILIO_AUTH_TOKEN",
          "TWILIO_WHATSAPP_NUMBER",
        ]).configured,
        liveReady: whatsappToken && metaWaba,
      },
      ai: {
        openRouterConfigured: openRouter,
        source: openRouter ? "app_secrets_or_env" : "missing",
      },
      oauth: {
        googleCalendar: envConfigured(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]),
        microsoftCalendar: envConfigured([
          "MICROSOFT_OAUTH_CLIENT_ID",
          "MICROSOFT_OAUTH_CLIENT_SECRET",
        ]),
      },
      workos: envConfigured(["WORKOS_API_KEY", "WORKOS_CLIENT_ID"]),
      email: { resendConfigured: Boolean(await getSecret("RESEND_API_KEY")) },
      observability: { sentryConfigured: Boolean(await getSecret("SENTRY_DSN")) },
    });
  }

  if (req.method === "PATCH") {
    const body = await req.json();
    const { org_id, ...patch } = body;
    if (!org_id) return json({ error: "org_id required" }, 400);
    const { data: org } = await db.from("organizations").select("settings").eq("id", org_id).single();
    const settings = { ...(org.settings ?? {}), ...patch };
    if (patch.odpc_registration_ref !== undefined) {
      settings.odpc_registered_at = patch.odpc_registration_ref
        ? new Date().toISOString()
        : null;
    }
    await db.from("organizations").update({ settings }).eq("id", org_id);
    return json({ ok: true, settings });
  }

  return json({ error: "method not allowed" }, 405);
});
