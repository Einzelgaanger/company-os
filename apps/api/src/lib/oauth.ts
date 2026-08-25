/**
 * OAuth authorize + callback (Google Calendar / Microsoft Graph).
 * PKCE + signed state JWT. Fails with oauth_not_configured when env missing.
 */
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export type OAuthProvider =
  | "google_calendar"
  | "microsoft_calendar"
  | "gmail"
  | "outlook";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const MS_AUTH = "https://login.microsoftonline.com";
const MS_TOKEN_PATH = "/oauth2/v2.0/token";

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

function stateSecret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_ACCESS_SECRET required for OAuth state");
  return new TextEncoder().encode(s);
}

export function oauthEnvStatus(provider: OAuthProvider): {
  configured: boolean;
  missing: string[];
} {
  if (provider === "gmail" || provider === "outlook") {
    return {
      configured: false,
      missing: ["FEATURE_EMAIL_INGESTION must be true (email OAuth is gated)"],
    };
  }
  if (provider === "google_calendar") {
    const missing: string[] = [];
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()) missing.push("GOOGLE_OAUTH_CLIENT_ID");
    if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
    return { configured: missing.length === 0, missing };
  }
  const missing: string[] = [];
  if (!process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim()) missing.push("MICROSOFT_OAUTH_CLIENT_ID");
  if (!process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim()) missing.push("MICROSOFT_OAUTH_CLIENT_SECRET");
  return { configured: missing.length === 0, missing };
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
  const env = oauthEnvStatus(input.provider);
  if (!env.configured) {
    const err = new Error("oauth_not_configured") as Error & { missing?: string[] };
    err.missing = env.missing;
    throw err;
  }

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

  const redirectUri = `${apiPublicUrl()}/connections/${input.provider}/callback`;

  if (input.provider === "google_calendar") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return { authUrl: `${GOOGLE_AUTH}?${params}`, state };
  }

  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "offline_access Calendars.Read User.Read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return {
    authUrl: `${MS_AUTH}/${tenant}/oauth2/v2.0/authorize?${params}`,
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
      provider: payload.provider as OAuthProvider,
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

export async function exchangeAuthorizationCode(input: {
  provider: OAuthProvider;
  code: string;
  verifier: string;
}): Promise<TokenBundle> {
  const redirectUri = `${apiPublicUrl()}/connections/${input.provider}/callback`;

  if (input.provider === "google_calendar") {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: input.verifier,
    });
    const res = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`google_token_exchange_failed:${res.status}:${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    let email: string | null = null;
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${json.access_token}` },
      });
      if (ui.ok) {
        const u = (await ui.json()) as { email?: string };
        email = u.email ?? null;
      }
    } catch {
      /* optional */
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000).toISOString()
        : null,
      externalAccount: email,
      scopes: (json.scope ?? "").split(" ").filter(Boolean),
    };
  }

  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_OAUTH_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET!,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: input.verifier,
  });
  const res = await fetch(`${MS_AUTH}/${tenant}${MS_TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`microsoft_token_exchange_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  let email: string | null = null;
  try {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    if (me.ok) {
      const u = (await me.json()) as { mail?: string; userPrincipalName?: string };
      email = u.mail ?? u.userPrincipalName ?? null;
    }
  } catch {
    /* optional */
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    externalAccount: email,
    scopes: (json.scope ?? "").split(" ").filter(Boolean),
  };
}
