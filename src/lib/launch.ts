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

export function oauthStartUrl(provider: string, orgId: string, userId: string): string {
  const state = `${orgId}:${userId}`;
  return `${base()}/functions/v1/oauth?provider=${encodeURIComponent(provider)}&action=start&state=${encodeURIComponent(state)}`;
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
