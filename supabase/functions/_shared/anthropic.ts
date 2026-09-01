// LLM wrapper for commitment extraction, reply classification, and report themes.
// Prefers app_secrets table (Doppler-synced), then Deno env fallback.

import { getSecret } from "./secrets.ts";

const OPENROUTER_MODEL_DEFAULT = "anthropic/claude-sonnet-4";
const ANTHROPIC_MODEL_DEFAULT = "claude-3-5-sonnet-latest";

export async function claude(system: string, user: string, maxTokens = 2000): Promise<string> {
  const openRouterKey = await getSecret("OPENROUTER_API_KEY");
  if (openRouterKey) {
    const model =
      (await getSecret("OPENROUTER_MODEL")) || OPENROUTER_MODEL_DEFAULT;
    return openRouter(openRouterKey, model, system, user, maxTokens);
  }

  const anthropicKey = await getSecret("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new Error("OPENROUTER_API_KEY or ANTHROPIC_API_KEY must be set (app_secrets or env)");
  const model = (await getSecret("ANTHROPIC_MODEL")) || ANTHROPIC_MODEL_DEFAULT;
  return anthropic(anthropicKey, model, system, user, maxTokens);
}

async function openRouter(
  key: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "HTTP-Referer": Deno.env.get("PUBLIC_APP_URL") ?? "https://loop.prodg.studio",
      "X-Title": "Loop",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function anthropic(
  key: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.content?.[0]?.text ?? "";
}

/** Parse a JSON object/array out of a model response, tolerating code fences. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
