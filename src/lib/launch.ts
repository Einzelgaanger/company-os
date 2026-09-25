/**
 * Supabase Edge Function helpers (production pilot data plane).
 */

const base = () =>
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function edgeFunctionsConfigured(): boolean {
  return Boolean(base() && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

async function edgeFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = `${base()}/functions/v1/${path}`;
  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (anon) headers.set("Authorization", `Bearer ${anon}`);
  return fetch(url, { ...opts, headers });
}

export type LaunchStatus = Record<string, unknown>;

export async function fetchLaunchStatus(orgId: string): Promise<LaunchStatus> {
  const res = await edgeFetch(`launch-readiness?org_id=${encodeURIComponent(orgId)}`);
  if (!res.ok) throw new Error("launch_status_failed");
  return res.json() as Promise<LaunchStatus>;
}

export async function patchLaunchSettings(
  orgId: string,
  patch: Record<string, unknown>,
): Promise<LaunchStatus> {
  const res = await edgeFetch("launch-readiness", {
    method: "PATCH",
    body: JSON.stringify({ org_id: orgId, ...patch }),
  });
  if (!res.ok) throw new Error("launch_patch_failed");
  return res.json() as Promise<LaunchStatus>;
}

export async function peekInvite(token: string): Promise<{
  email: string;
  role: string;
  org_name: string;
} | null> {
  const res = await fetch(
    `${base()}/functions/v1/invite?token=${encodeURIComponent(token)}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
    },
  );
  if (!res.ok) return null;
  return res.json() as Promise<{ email: string; role: string; org_name: string }>;
}

export async function acceptInviteAccount(input: {
  token: string;
  password: string;
  fullName: string;
}): Promise<{ email: string }> {
  const res = await edgeFetch("invite", {
    method: "POST",
    body: JSON.stringify({ action: "accept", ...input }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "invite_accept_failed");
  }
  return res.json() as Promise<{ email: string }>;
}

export function oauthStartUrl(
  provider: string,
  orgId: string,
  userId: string,
  returnTo = "/integrations",
): string {
  const state = `${orgId}:${userId}`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const params = new URLSearchParams({
    provider,
    action: "start",
    state,
    return: returnTo,
  });
  // Browser navigations cannot set the gateway header. The anon key is public.
  if (anon) params.set("apikey", anon);
  return `${base()}/functions/v1/oauth?${params}`;
}

/** True when this email is a registered account. Null when the lookup itself failed. */
export async function accountExists(email: string): Promise<boolean | null> {
  const res = await edgeFetch("account-exists", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { exists?: boolean };
  return data.exists === true;
}

export async function sendPhoneOtp(userId: string): Promise<void> {
  const res = await edgeFetch("verify-otp", {
    method: "POST",
    body: JSON.stringify({ action: "send", user_id: userId }),
  });
  if (!res.ok) throw new Error("otp_send_failed");
}

export async function verifyPhoneOtp(userId: string, code: string): Promise<boolean> {
  const res = await edgeFetch("verify-otp", {
    method: "POST",
    body: JSON.stringify({ action: "verify", user_id: userId, code }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verified?: boolean };
  return data.verified === true;
}
