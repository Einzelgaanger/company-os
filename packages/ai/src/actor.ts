/**
 * Actor — template render only; NEVER sees untrusted content (C-4).
 * Recipients and variables must already be DB-resolved IDs / values.
 */

export type TemplateRenderInput = {
  templateBody: string;
  /** Positional {{1}}..{{n}} values — DB-bound only. */
  variables: string[];
};

export type ActorSendIntent = {
  templateKey: string;
  recipientUserId: string;
  renderedBody: string;
  variables: string[];
};

/** Render Meta-style {{n}} placeholders. No model in this path. */
export function renderTemplate(input: TemplateRenderInput): string {
  let out = input.templateBody;
  for (let i = 0; i < input.variables.length; i++) {
    const token = new RegExp(`\\{\\{${i + 1}\\}\\}`, "g");
    out = out.replace(token, input.variables[i] ?? "");
  }
  return out;
}

/**
 * Build a send intent from already-resolved DB entities.
 * Deliberately has no parameter for transcript / model free text.
 */
export function buildSendIntent(args: {
  templateKey: string;
  templateBody: string;
  recipientUserId: string;
  variables: string[];
}): ActorSendIntent {
  if (!args.recipientUserId) {
    throw new Error("actor: recipientUserId required (must come from DB)");
  }
  return {
    templateKey: args.templateKey,
    recipientUserId: args.recipientUserId,
    renderedBody: renderTemplate({
      templateBody: args.templateBody,
      variables: args.variables,
    }),
    variables: args.variables,
  };
}

/** Actor never imports or accepts raw source content. */
export const ACTOR_SEES_UNTRUSTED_CONTENT = false as const;
