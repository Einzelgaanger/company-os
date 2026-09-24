/**
 * OAuth engine for every connector in providerRegistry.ts.
 *
 * PKCE wherever the provider supports it, a signed single-use state JWT with a
 * 10-minute TTL carrying tenant / user / provider / nonce, and a hard failure
 * (`oauth_not_configured`) when client credentials are absent — never a partially
 * working handshake (docs/design/09_CONNECTORS.md §9.2).
 */
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {
  connector,
  connectorAvailability,
  resolveUrl,
  type ConnectorDefinition,
  type OAuthConfig,
} from "./providerRegistry.js";

/** Any connector id. Validated against the registry, not the type system. */
export type OAuthProvider = string;

export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:5173"
  );
}

export function apiPublicUrl(): string {
  return (
    process.env.API_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.VITE_API_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3001"
  );
}

export function redirectUriFor(provider: string): string {
  return `${apiPublicUrl()}/connections/${provider}/callback`;
}

function stateSecret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_ACCESS_SECRET required for OAuth state");
  return new TextEncoder().encode(s);
}

export function oauthEnvStatus(provider: OAuthProvider): {
  configured: boolean;
  missing: string[];
} {
  const def = connector(provider);
  if (!def) return { configured: false, missing: ["unknown_provider"] };
  return connectorAvailability(def);
}

/** Registry entry plus its OAuth block, or a typed failure. */
function oauthDef(provider: string): {
  def: ConnectorDefinition;
  oauth: OAuthConfig;
} {
  const def = connector(provider);
  if (!def) throw new Error("unknown_provider");
  if (def.auth !== "oauth2" || !def.oauth) throw new Error("not_an_oauth_provider");
  const availability = connectorAvailability(def);
  if (!availability.configured) {
    const err = new Error("oauth_not_configured") as Error & { missing?: string[] };
    err.missing = availability.missing;
    throw err;
  }
  return { def, oauth: def.oauth };
}

function clientCredentials(def: ConnectorDefinition): {
  id: string;
  secret: string;
} {
  return {
    id: process.env[def.clientIdEnv ?? ""]?.trim() ?? "",
    secret: process.env[def.clientSecretEnv ?? ""]?.trim() ?? "",
  };
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function buildAuthorizeUrl(input: {
  provider: OAuthProvider;
  tenantId: string;
  userId: string;
}): Promise<{ authUrl: string; state: string }> {
  const { def, oauth } = oauthDef(input.provider);
  const { id: clientId } = clientCredentials(def);
  const { verifier, challenge } = pkcePair();

  const state = await new SignJWT({
    tid: input.tenantId,
    uid: input.userId,
    provider: input.provider,
    nonce: randomBytes(8).toString("hex"),
    verifier,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateSecret());

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(input.provider),
    response_type: "code",
    state,
  });
  if (oauth.scopes.length > 0) params.set("scope", oauth.scopes.join(" "));
  for (const [k, v] of Object.entries(oauth.authorizeParams ?? {})) {
    params.set(k, resolveUrl(v, def));
  }
  if (oauth.pkce) {
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }

  return {
    authUrl: `${resolveUrl(oauth.authorizeUrl, def)}?${params}`,
    state,
  };
}

export type OAuthStatePayload = {
  tid: string;
  uid: string;
  provider: OAuthProvider;
  nonce: string;
  verifier: string;
};

export async function verifyOAuthState(state: string): Promise<OAuthStatePayload | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret());
    if (
      typeof payload.tid !== "string" ||
      typeof payload.uid !== "string" ||
      typeof payload.provider !== "string" ||
      typeof payload.verifier !== "string"
    ) {
      return null;
    }
    return {
      tid: payload.tid,
      uid: payload.uid,
      provider: payload.provider,
      nonce: String(payload.nonce ?? ""),
      verifier: payload.verifier,
    };
  } catch {
    return null;
  }
}

export type TokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  externalAccount: string | null;
  scopes: string[];
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  /** Slack returns ok:false with a 200. */
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

function basicHeader(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/** Walks a dotted path through a JSON response; array indices are numeric keys. */
function pick(source: unknown, path: string[] | undefined): string | null {
  if (!path || path.length === 0) return null;
  let node: unknown = source;
  for (const key of path) {
    if (node == null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" && node.trim() ? node : null;
}

async function postTokenRequest(
  def: ConnectorDefinition,
  oauth: OAuthConfig,
  body: URLSearchParams,
): Promise<TokenResponse> {
  const { id, secret } = clientCredentials(def);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (oauth.jsonAccept) headers.Accept = "application/json";
  if (oauth.clientAuth === "basic") {
    headers.Authorization = basicHeader(id, secret);
  } else {
    body.set("client_id", id);
    body.set("client_secret", secret);
  }

  const res = await fetch(resolveUrl(oauth.tokenUrl, def), {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `token_exchange_failed:${def.id}:${res.status}:${text.slice(0, 200)}`,
    );
  }
  let json: TokenResponse;
  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    // Some providers answer form-encoded unless asked for JSON.
    json = Object.fromEntries(new URLSearchParams(text)) as TokenResponse;
  }
  if (json.ok === false) {
    throw new Error(`token_exchange_failed:${def.id}:${json.error ?? "provider_error"}`);
  }
  if (!json.access_token) {
    throw new Error(`token_exchange_failed:${def.id}:no_access_token`);
  }
  return json;
}

/** Identity probe is best effort — a connection is still valid without a label. */
async function resolveAccountLabel(
  def: ConnectorDefinition,
  oauth: OAuthConfig,
  accessToken: string,
  tokenResponse: TokenResponse,
): Promise<string | null> {
  const fromToken = pick(tokenResponse, oauth.identityFromToken);
  if (fromToken) return fromToken;
  if (!oauth.identityUrl) return null;
  try {
    const res = await fetch(resolveUrl(oauth.identityUrl, def), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return (
      pick(json, oauth.identityPath) ??
      pick(json, ["email"]) ??
      pick(json, ["userPrincipalName"]) ??
      null
    );
  } catch {
    return null;
  }
}

function toBundle(
  json: TokenResponse,
  oauth: OAuthConfig,
  externalAccount: string | null,
  previousRefresh: string | null = null,
): TokenBundle {
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token ?? previousRefresh,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    externalAccount,
    scopes: (json.scope ?? oauth.scopes.join(" ")).split(" ").filter(Boolean),
  };
}

export async function exchangeAuthorizationCode(input: {
  provider: OAuthProvider;
  code: string;
  verifier: string;
}): Promise<TokenBundle> {
  const { def, oauth } = oauthDef(input.provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUriFor(input.provider),
  });
  if (oauth.pkce) body.set("code_verifier", input.verifier);

  const json = await postTokenRequest(def, oauth, body);
  const account = await resolveAccountLabel(def, oauth, json.access_token!, json);
  return toBundle(json, oauth, account);
}

/**
 * Proactive refresh (housekeeping runs at 75% of token lifetime). Never called
 * lazily on failure — a dead connector must surface, not retry silently.
 */
export async function refreshAccessToken(input: {
  provider: OAuthProvider;
  refreshToken: string;
}): Promise<TokenBundle> {
  const { def, oauth } = oauthDef(input.provider);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  if (oauth.scopeOnRefresh && oauth.scopes.length > 0) {
    body.set("scope", oauth.scopes.join(" "));
  }
  const json = await postTokenRequest(def, oauth, body);
  const account = await resolveAccountLabel(def, oauth, json.access_token!, json);
  return toBundle(json, oauth, account, input.refreshToken);
}

/** Best-effort upstream revoke before the local row is cleared. */
export async function revokeAccessToken(input: {
  provider: OAuthProvider;
  accessToken: string;
}): Promise<boolean> {
  let def: ConnectorDefinition;
  let oauth: OAuthConfig;
  try {
    ({ def, oauth } = oauthDef(input.provider));
  } catch {
    return false;
  }
  if (!oauth.revokeUrl) return false;
  const { id, secret } = clientCredentials(def);
  try {
    const res = await fetch(resolveUrl(oauth.revokeUrl, def), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicHeader(id, secret),
      },
      body: new URLSearchParams({ token: input.accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ApiKeyProbeResult = {
  ok: boolean;
  account: string | null;
  /** Provider-side reason when ok is false. Safe to show an admin. */
  detail?: string;
};

/**
 * Validates a pasted credential before it is stored, so a typo fails at paste
 * time instead of silently producing an empty connector.
 * Composite credentials ("id:secret") are split for Basic auth.
 */
export async function probeApiKey(
  provider: OAuthProvider,
  credential: string,
): Promise<ApiKeyProbeResult> {
  const def = connector(provider);
  if (!def || def.auth !== "api_key" || !def.apiKey) {
    return { ok: false, account: null, detail: "not_an_api_key_provider" };
  }
  const cfg = def.apiKey;
  if (cfg.probeAuth === "none" || !cfg.probeUrl) {
    // No cheap read endpoint — accept the credential and let the first sync judge.
    return { ok: true, account: null };
  }

  const url = cfg.probeUrl.replaceAll("{credential}", encodeURIComponent(credential));
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.probeAuth === "bearer") headers.Authorization = `Bearer ${credential}`;
  if (cfg.probeAuth === "basic") {
    const [user, pass = ""] = credential.split(":");
    headers.Authorization = basicHeader(user, pass);
  }
  if (cfg.probeAuth === "header" && cfg.probeHeader) {
    headers[cfg.probeHeader] = credential;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { ok: false, account: null, detail: `provider_status_${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    return { ok: true, account: pick(json, cfg.identityPath) };
  } catch {
    return { ok: false, account: null, detail: "provider_unreachable" };
  }
}
