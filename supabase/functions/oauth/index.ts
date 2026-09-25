// oauth — connector OAuth for the production (Supabase) data plane.
//
//   GET ?provider=slack&action=start&state=<tenantId>:<userId>
//   GET ?provider=slack&action=callback&code=...&state=...
//
// Endpoints come from _shared/providers.generated.ts, which is projected from
// apps/api/src/lib/providerRegistry.ts — the two planes cannot disagree.
//
// Hard rules (docs/design/09_CONNECTORS.md §9.2):
//   · PKCE wherever the provider supports it; verifier travels inside signed state
//   · state is HMAC-signed with a 10-minute TTL and verified on the way back
//   · tokens are AES-256-GCM encrypted with TOKEN_ENCRYPTION_KEY before storage;
//     a missing key refuses the connection instead of writing plaintext
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import { encryptToken, tokenEncryptionConfigured } from "../_shared/tokenCrypto.ts";
import { EDGE_CONNECTORS, type EdgeConnector } from "../_shared/providers.generated.ts";

const REDIRECT_BASE =
  Deno.env.get("PUBLIC_APP_URL") ?? Deno.env.get("APP_BASE_URL") ?? "https://os.jabali.studio";

const ALLOWED_RETURNS = new Set(["/integrations", "/onboarding/connections"]);

function appPath(value: string | null | undefined): string {
  return value && ALLOWED_RETURNS.has(value) ? value : "/integrations";
}

/** Browser navigations should land back in the app, never on a JSON error page. */
function backToApp(error: string, provider = "", returnTo?: string | null): Response {
  const params = new URLSearchParams({ error });
  if (provider) params.set("provider", provider);
  return Response.redirect(`${REDIRECT_BASE}${appPath(returnTo)}?${params}`, 302);
}
const STATE_TTL_MS = 10 * 60_000;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (value: string) =>
  Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );

async function hmacKey(): Promise<CryptoKey> {
  const secret =
    (await getSecret("OAUTH_STATE_SECRET")) ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";
  if (!secret) throw new Error("state_secret_missing");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

type StatePayload = {
  tid: string;
  uid: string;
  provider: string;
  verifier: string;
  iat: number;
  nonce: string;
  ret?: string;
};

async function signState(payload: StatePayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifyState(state: string): Promise<StatePayload | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    fromB64url(sig),
    enc.encode(body),
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as StatePayload;
    if (Date.now() - payload.iat > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

async function resolveUrl(url: string, def: EdgeConnector): Promise<string> {
  let out = url;
  if (out.includes("{instance}")) {
    const value = def.instanceSecret ? await getSecret(def.instanceSecret) : null;
    if (!value) throw new Error(`instance_not_configured:${def.instanceSecret}`);
    out = out.replaceAll("{instance}", value);
  }
  if (out.includes("{tenant}")) {
    out = out.replaceAll("{tenant}", (await getSecret("MICROSOFT_TENANT_ID")) ?? "common");
  }
  return out;
}

function pick(source: any, path: string[] | null): string | null {
  if (!path) return null;
  let node = source;
  for (const key of path) {
    if (node == null || typeof node !== "object") return null;
    node = node[key];
  }
  return typeof node === "string" && node.trim() ? node : null;
}

async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

/** One stable redirect URI so Google (and every other provider) only needs a single allowlist entry. */
function redirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const rawState = url.searchParams.get("state") ?? "";
  const actionParam = url.searchParams.get("action");
  const isCallback = actionParam === "callback" || Boolean(code) || Boolean(oauthError);

  let provider = url.searchParams.get("provider") ?? "";
  if (isCallback && !provider && rawState) {
    const preview = await verifyState(rawState);
    provider = preview?.provider ?? "";
  }
  const action = isCallback ? "callback" : (actionParam ?? "start");
  const def = EDGE_CONNECTORS[provider];

  const returnTo = appPath(url.searchParams.get("return"));
  const fail = (reason: string, dest = returnTo) =>
    Response.redirect(
      `${REDIRECT_BASE}${dest}?error=${encodeURIComponent(reason)}&provider=${encodeURIComponent(provider || "unknown")}`,
      302,
    );

  if (!def) return action === "start" ? fail("unknown_provider") : json({ error: "unknown_provider", provider }, 404);

  const clientId = await getSecret(def.clientIdSecret);
  const clientSecret = await getSecret(def.clientSecretSecret);
  if (!clientId || !clientSecret) {
    return action === "start" ? fail("oauth_not_configured") : json({ error: "oauth_not_configured", provider }, 503);
  }
  if (!(await tokenEncryptionConfigured())) {
    return action === "start"
      ? fail("token_encryption_not_configured")
      : json({ error: "token_encryption_not_configured" }, 503);
  }

  if (action === "start") {
    const [tid, uid] = (url.searchParams.get("state") ?? "").split(":");
    if (!tid) return fail("invalid_state");
    const { verifier, challenge } = await pkcePair();
    const state = await signState({
      tid,
      uid: uid ?? "",
      provider,
      verifier,
      iat: Date.now(),
      nonce: b64url(crypto.getRandomValues(new Uint8Array(8))),
      ret: returnTo,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      state,
    });
    if (def.scopes.length > 0) params.set("scope", def.scopes.join(" "));
    for (const [k, v] of Object.entries(def.authorizeParams)) {
      params.set(k, await resolveUrl(v, def));
    }
    if (def.pkce) {
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }
    return Response.redirect(`${await resolveUrl(def.authorizeUrl, def)}?${params}`, 302);
  }

  if (action !== "callback") return backToApp("unknown_action", provider, returnTo);

  const failure = url.searchParams.get("error");
  const payload = await verifyState(rawState);
  const dest = appPath(payload?.ret ?? returnTo);
  if (failure) return backToApp(failure, provider, dest);
  if (!code || !payload || payload.provider !== provider) {
    return backToApp("invalid_state", provider, dest);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  if (def.pkce) body.set("code_verifier", payload.verifier);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (def.jsonAccept) headers.Accept = "application/json";
  if (def.clientAuth === "basic") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  const tokenRes = await fetch(await resolveUrl(def.tokenUrl, def), {
    method: "POST",
    headers,
    body,
  });
  const text = await tokenRes.text();
  if (!tokenRes.ok) return backToApp("token_exchange_failed", provider, dest);
  let tokens: any;
  try {
    tokens = JSON.parse(text);
  } catch {
    tokens = Object.fromEntries(new URLSearchParams(text));
  }
  if (!tokens.access_token || tokens.ok === false) return backToApp("no_access_token", provider, dest);

  let account: string | null = pick(tokens, def.identityFromToken);
  if (!account && def.identityUrl) {
    try {
      const me = await fetch(await resolveUrl(def.identityUrl, def), {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
      });
      if (me.ok) {
        const identity = await me.json();
        account =
          pick(identity, def.identityPath) ??
          pick(identity, ["email"]) ??
          pick(identity, ["userPrincipalName"]);
      }
    } catch {
      /* identity is a label, not a requirement */
    }
  }

  const db = adminClient();
  const userId = def.orgLevel ? null : payload.uid || null;
  const row = {
    org_id: payload.tid,
    user_id: userId,
    provider,
    status: "connected",
    access_token: await encryptToken(tokens.access_token),
    refresh_token: tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null,
    scopes: (tokens.scope ?? def.scopes.join(" ")).split(" ").filter(Boolean),
    external_account_email: account,
    connected_at: new Date().toISOString(),
    last_synced_at: null,
    error_message: null,
  };

  const lookup = db
    .from("connections")
    .select("id")
    .eq("org_id", payload.tid)
    .eq("provider", provider);
  const { data: existing } = await (userId === null
    ? lookup.is("user_id", null)
    : lookup.eq("user_id", userId)
  ).maybeSingle();

  if (existing) {
    await db.from("connections").update(row).eq("id", existing.id);
  } else {
    await db.from("connections").insert(row);
  }

  // First pull as soon as the account is connected. Cron repeats it.
  const base = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const kick = provider === "google_calendar" || provider === "microsoft_calendar" ? "sync-calendar" : "sync-sources";
  fetch(`${base}/functions/v1/${kick}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ org_id: payload.tid, provider }),
  }).catch(() => {});

  return Response.redirect(
    `${REDIRECT_BASE}${dest}?connected=${encodeURIComponent(provider)}`,
    302,
  );
});
