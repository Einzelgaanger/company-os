import { z } from "zod";

/**
 * Closed extraction schema — no owner_email (exfiltration primitive).
 * Owners resolve against the roster by name only.
 */
export const ExtractedCommitmentSchema = z
  .object({
    title: z.string().min(1).max(300),
    owner_name: z.string().nullable(),
    requested_by_name: z.string().nullable().optional(),
    due_date: z.string().nullable(),
    due_date_source: z.enum(["stated", "none"]),
    excerpt: z.string().min(1).max(2000),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const ExtractCommitmentsOutputSchema = z
  .object({
    commitments: z.array(ExtractedCommitmentSchema),
  })
  .strict();

export type ExtractedCommitment = z.infer<typeof ExtractedCommitmentSchema>;
export type ExtractCommitmentsOutput = z.infer<
  typeof ExtractCommitmentsOutputSchema
>;
