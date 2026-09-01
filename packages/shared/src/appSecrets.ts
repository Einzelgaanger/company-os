/**
 * Platform secrets — app_secrets (Postgres via Supabase REST) first, then process.env.
 * Used by API workers and @loop/ai when OPENROUTER is stored in DB only.
 */
const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 60_000;

export async function getAppSecret(name: string): Promise<string | null> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && serviceKey) {
    try {
      const res = await fetch(
        `${url}/rest/v1/app_secrets?key=eq.${encodeURIComponent(name)}&select=value`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as { value?: string }[];
        const v = rows[0]?.value?.trim();
        if (v) {
          cache.set(name, { value: v, at: Date.now() });
          return v;
        }
      }
    } catch {
      /* fall through */
    }
  }

  const env = process.env[name]?.trim();
  if (env) {
    cache.set(name, { value: env, at: Date.now() });
    return env;
  }
  return null;
}

export async function getAppSecretRequired(name: string): Promise<string> {
  const v = await getAppSecret(name);
  if (!v) throw new Error(`${name} must be set in app_secrets or environment`);
  return v;
}
