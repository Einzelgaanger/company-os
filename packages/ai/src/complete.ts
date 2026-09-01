/**
 * Model complete() — inject into runReader.
 * Uses OpenRouter when OPENROUTER_API_KEY is set; otherwise a deterministic stub
 * for offline/CI that returns empty commitments (never invents work).
 */
export type CompleteArgs = {
  systemPrompt: string;
  userContent: string;
};

export type CompleteFn = (args: CompleteArgs) => Promise<string>;

export function createOpenRouterComplete(opts?: {
  apiKey?: string;
  model?: string;
}): CompleteFn {
  const apiKey = opts?.apiKey ?? process.env.OPENROUTER_API_KEY;
  const model =
    opts?.model ??
    process.env.OPENROUTER_MODEL ??
    "anthropic/claude-sonnet-4";

  return async ({ systemPrompt, userContent }) => {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY required for live complete()");
    }
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`openrouter_http_${res.status}`);
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content ?? "";
  };
}

/** Offline stub — returns schema-valid empty extraction (no invented commitments). */
export const stubComplete: CompleteFn = async () =>
  JSON.stringify({ commitments: [] });

import { getAppSecret } from "@loop/shared/appSecrets";

/** Prefer live when keyed (env or app_secrets); else stub (never throws "not wired"). */
export function resolveComplete(override?: CompleteFn): CompleteFn {
  if (override) return override;
  if (process.env.OPENROUTER_API_KEY) {
    return createOpenRouterComplete();
  }
  return stubComplete;
}

/** Async resolver — reads OpenRouter from app_secrets when env unset. */
export async function resolveCompleteAsync(override?: CompleteFn): Promise<CompleteFn> {
  if (override) return override;
  const apiKey = (await getAppSecret("OPENROUTER_API_KEY")) ?? undefined;
  const model = (await getAppSecret("OPENROUTER_MODEL")) ?? undefined;
  if (apiKey) return createOpenRouterComplete({ apiKey, model });
  return stubComplete;
}
