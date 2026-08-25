import { z } from "zod";
import { resolveComplete } from "./complete.js";

/**
 * Reader — sees untrusted content; NO tools, NO network, NO DB write (C-4).
 * Only permitted output: JSON matching a strict Zod schema.
 */

export type ReaderCallInput = {
  systemPrompt: string;
  userContent: string;
  /** Closed schema — additional properties rejected by Zod .strict(). */
  schema: z.ZodTypeAny;
  /** Injected model caller — production wires OpenRouter/Anthropic. */
  complete?: (args: {
    systemPrompt: string;
    userContent: string;
  }) => Promise<string>;
};

export type ReaderResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "invalid_json" | "schema_mismatch" | "empty" };

/**
 * Invoke the reader. Strips code fences if present, parses JSON, validates.
 * Anything that fails validation is discarded — never partially trusted.
 */
export async function runReader<T>(
  input: ReaderCallInput & { schema: z.ZodType<T> },
): Promise<ReaderResult<T>> {
  const complete = input.complete ?? resolveComplete();
  const raw = await complete({
    systemPrompt: input.systemPrompt,
    userContent: input.userContent,
  });

  if (!raw?.trim()) return { ok: false, reason: "empty" };

  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const result = input.schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "schema_mismatch" };
  }

  return { ok: true, data: result.data };
}

/** Reader has intentionally no tool registry export. */
export const READER_HAS_TOOLS = false as const;
