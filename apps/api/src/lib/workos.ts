/**
 * WorkOS SSO / AuthKit — authorize + callback when env is set.
 * Missing credentials → clear oauth_not_configured (never fake SSO).
 */
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";

export function workosConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY?.trim() && process.env.WORKOS_CLIENT_ID?.trim(),
  );
}

function appBase(): string {
  return (
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:5173"
  );
}

function apiBase(): string {
  return (
    process.env.API_PUBLIC_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3001"
  );
}

function stateSecret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_ACCESS_SECRET required");
  return new TextEncoder().encode(s);
}

export async function buildWorkosAuthorizeUrl(input: {
  organizationId?: string;
  tenantId?: string;
}): Promise<{ authUrl: string; state: string }> {
  if (!workosConfigured()) {
    throw new Error("workos_not_configured");
  }
  const state = await new SignJWT({
    kind: "workos_sso",
    tid: input.tenantId ?? null,
    nonce: randomBytes(8).toString("hex"),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateSecret());

  const params = new URLSearchParams({
    client_id: process.env.WORKOS_CLIENT_ID!,
    redirect_uri: `${apiBase()}/auth/sso/callback`,
    response_type: "code",
    state,
  });
  if (input.organizationId) params.set("organization", input.organizationId);

  return {
    authUrl: `https://api.workos.com/sso/authorize?${params}`,
    state,
  };
}

export async function verifyWorkosState(state: string): Promise<{ tid: string | null } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret());
    if (payload.kind !== "workos_sso") return null;
    return { tid: typeof payload.tid === "string" ? payload.tid : null };
  } catch {
    return null;
  }
}

export async function exchangeWorkosCode(code: string): Promise<{
  email: string;
  firstName: string | null;
  lastName: string | null;
  idpId: string;
}> {
  if (!workosConfigured()) throw new Error("workos_not_configured");
  const res = await fetch("https://api.workos.com/sso/token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WORKOS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.WORKOS_CLIENT_ID,
      client_secret: process.env.WORKOS_API_KEY,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`workos_token_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    profile?: {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  const p = json.profile;
  if (!p?.email || !p.id) throw new Error("workos_profile_incomplete");
  return {
    email: p.email,
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    idpId: p.id,
  };
}

export function workosSpaRedirect(): string {
  return `${appBase()}/login/sso?ok=1`;
}

export function workosSpaErrorRedirect(reason: string): string {
  return `${appBase()}/login/sso?error=${encodeURIComponent(reason)}`;
}
