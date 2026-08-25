// LLM wrapper for commitment extraction, reply classification, and report themes.
// Prefers Deno env (OPENROUTER_API_KEY / ANTHROPIC_API_KEY), then app_secrets table.

import { adminClient } from "./supabase.ts";

const OPENROUTER_MODEL_DEFAULT = "anthropic/claude-sonnet-4";
const ANTHROPIC_MODEL_DEFAULT = "claude-3-5-sonnet-latest";

async function secretFromDb(key: string): Promise<string | null> {
  try {
    const db = adminClient();
    const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function claude(system: string, user: string, maxTokens = 2000): Promise<string> {
  const openRouterKey =
    Deno.env.get("OPENROUTER_API_KEY") || (await secretFromDb("OPENROUTER_API_KEY"));
  if (openRouterKey) {
    const model =
      Deno.env.get("OPENROUTER_MODEL") ||
      (await secretFromDb("OPENROUTER_MODEL")) ||
      OPENROUTER_MODEL_DEFAULT;
    return openRouter(openRouterKey, model, system, user, maxTokens);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || (await secretFromDb("ANTHROPIC_API_KEY"));
  if (!anthropicKey) throw new Error("OPENROUTER_API_KEY or ANTHROPIC_API_KEY must be set (env or app_secrets)");
  const model = Deno.env.get("ANTHROPIC_MODEL") || ANTHROPIC_MODEL_DEFAULT;
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
