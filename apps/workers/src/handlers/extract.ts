import {
  extractCommitmentsPipeline,
  type ExtractPipelineInput,
  type ExtractPipelineResult,
  resolveCompleteAsync,
} from "@loop/ai";
import { linkProjectDeterministic, type LinkMeeting, type LinkProject } from "@loop/shared";
import type { RosterUser } from "@loop/ai";

export type ExtractJobInput = {
  transcriptExcerpt: string;
  /** @deprecated Reader output is produced inside the pipeline — ignored when present. */
  proposed?: Array<{
    title: string;
    ownerName: string | null;
    dueDate: string | null;
  }>;
  roster: RosterUser[];
  projects: LinkProject[];
  meeting: LinkMeeting;
  complete?: ExtractPipelineInput["complete"];
};

export type ExtractJobResult = {
  accepted: Array<{
    title: string;
    ownerUserId: string | null;
    dueDate: string | null;
    projectId: string | null;
    reviewRequired: boolean;
  }>;
  rejected: Array<{ title: string; reason: string }>;
  injection?: boolean;
  outboundActions: 0;
};

/**
 * Extract worker — sanitize → runReader → validate → persist candidates.
 * No other path may create commitments from model output.
 */
export async function processExtract(
  job: ExtractJobInput,
): Promise<ExtractJobResult> {
  const pipeline: ExtractPipelineResult = await extractCommitmentsPipeline({
    transcript: job.transcriptExcerpt,
    roster: job.roster,
    complete: job.complete ?? (await resolveCompleteAsync()),
  });

  if (!pipeline.ok) {
    return {
      accepted: [],
      rejected: [
        {
          title: "(batch)",
          reason: pipeline.reason,
        },
      ],
      injection: pipeline.reason === "injection_tripwire",
      outboundActions: 0,
    };
  }

  const link = linkProjectDeterministic(job.meeting, job.projects);
  const accepted = pipeline.commitments.map((c) => ({
    title: c.title,
    ownerUserId: c.ownerUserId,
    dueDate: c.dueDate,
    projectId: link.projectId,
    reviewRequired: c.reviewRequired,
  }));

  return { accepted, rejected: [], outboundActions: 0 };
}
