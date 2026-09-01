// Platform secrets — app_secrets table first, then Deno env (cached 60s).
import { adminClient } from "./supabase.ts";

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 60_000;

export async function getSecret(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  try {
    const db = adminClient();
    const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle();
    if (data?.value?.trim()) {
      cache.set(key, { value: data.value.trim(), at: Date.now() });
      return data.value.trim();
    }
  } catch {
    /* service role or table missing */
  }

  const env = Deno.env.get(key)?.trim();
  if (env) {
    cache.set(key, { value: env, at: Date.now() });
    return env;
  }
  return null;
}

export async function getSecretRequired(key: string): Promise<string> {
  const v = await getSecret(key);
  if (!v) throw new Error(`${key} must be set in app_secrets or environment`);
  return v;
}
