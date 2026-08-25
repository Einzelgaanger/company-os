import { ExtractCommitmentsOutputSchema } from "./schema/extract_commitments.js";
import { EXTRACT_COMMITMENTS_V1 } from "./prompts/extract_commitments/v1.js";
import { runReader } from "./reader.js";
import { resolveComplete, type CompleteFn } from "./complete.js";
import { sanitizeUntrusted } from "./sanitize.js";
import {
  rejectUnsafeOutputFields,
  resolveNameToUserId,
  type RosterUser,
} from "./validator.js";

export type ExtractPipelineInput = {
  transcript: string;
  roster: RosterUser[];
  participantEmails?: string[];
  complete?: CompleteFn;
};

export type ExtractPipelineResult =
  | {
      ok: true;
      commitments: Array<{
        title: string;
        ownerUserId: string | null;
        ownerName: string | null;
        dueDate: string | null;
        excerpt: string;
        confidence: number;
        reviewRequired: boolean;
      }>;
      stripped: string[];
    }
  | {
      ok: false;
      reason: "injection_tripwire" | "reader_failed";
      detail?: string;
      stripped: string[];
      outboundActions: 0;
    };

/**
 * Only path that may create commitments from model output:
 * sanitize → runReader → validate tripwires → resolve names.
 */
export async function extractCommitmentsPipeline(
  input: ExtractPipelineInput,
): Promise<ExtractPipelineResult> {
  const { text, stripped } = sanitizeUntrusted(input.transcript);
  const complete = resolveComplete(input.complete);

  const reader = await runReader({
    systemPrompt: EXTRACT_COMMITMENTS_V1,
    userContent: text,
    schema: ExtractCommitmentsOutputSchema,
    complete,
  });

  if (!reader.ok) {
    return {
      ok: false,
      reason: "reader_failed",
      detail: reader.reason,
      stripped,
      outboundActions: 0,
    };
  }

  const fields: Array<string | null | undefined> = [];
  for (const c of reader.data.commitments) {
    fields.push(c.title, c.owner_name, c.excerpt, c.due_date);
  }
  const trip = rejectUnsafeOutputFields(fields);
  if (!trip.ok) {
    return {
      ok: false,
      reason: "injection_tripwire",
      detail: trip.sample,
      stripped,
      outboundActions: 0,
    };
  }

  const participantEmails = new Set(
    (input.participantEmails ?? []).map((e) => e.toLowerCase()),
  );

  const commitments = reader.data.commitments.map((c) => {
    const resolved = resolveNameToUserId(c.owner_name, input.roster);
    const reviewRequired =
      resolved.status !== "resolved" ||
      (c.confidence ?? 0) < 0.7 ||
      c.due_date_source === "none";
    // Email in model output already blocked; also reject owner claiming outsider email via name field
    if (
      c.owner_name &&
      participantEmails.size > 0 &&
      /@/.test(c.owner_name) &&
      !participantEmails.has(c.owner_name.toLowerCase())
    ) {
      return null;
    }
    return {
      title: c.title,
      ownerUserId: resolved.status === "resolved" ? resolved.userId : null,
      ownerName: c.owner_name,
      dueDate: c.due_date_source === "stated" ? c.due_date : null,
      excerpt: c.excerpt,
      confidence: c.confidence,
      reviewRequired:
        reviewRequired ||
        (resolved.status !== "resolved" && Boolean(c.owner_name)),
    };
  });

  if (commitments.some((c) => c === null)) {
    return {
      ok: false,
      reason: "injection_tripwire",
      detail: "outsider_email",
      stripped,
      outboundActions: 0,
    };
  }

  return {
    ok: true,
    commitments: commitments as NonNullable<(typeof commitments)[number]>[],
    stripped,
  };
}
