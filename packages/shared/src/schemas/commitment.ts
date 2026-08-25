import { z } from "zod";

/** Commitment status enum matching 02_DATA_MODEL.md §2.3. */
export const commitmentStatusSchema = z.enum([
  "open",
  "in_progress",
  "blocked",
  "at_risk",
  "overdue",
  "escalated",
  "done",
  "cancelled",
]);

export const commitmentPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const commitmentSourceTypeSchema = z.enum([
  "meeting",
  "email",
  "manual",
  "whatsapp",
  "calendar",
  "import",
]);

export const dueDateSourceSchema = z.enum([
  "stated",
  "inferred",
  "manual",
  "none",
]);

export const commitmentSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    milestoneId: z.string().uuid().nullable().optional(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    ownerExternalName: z.string().nullable().optional(),
    ownerExternalEmail: z.string().nullable().optional(),
    ownerConfidence: z.number().min(0).max(1).nullable().optional(),
    requestedByUserId: z.string().uuid().nullable().optional(),
    sourceType: commitmentSourceTypeSchema,
    sourceId: z.string().uuid().nullable().optional(),
    sourceExcerpt: z.string().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    dueDateSource: dueDateSourceSchema.nullable().optional(),
    status: commitmentStatusSchema.default("open"),
    priority: commitmentPrioritySchema.default("medium"),
    progressPct: z.number().min(0).max(100).default(0),
    reviewRequired: z.boolean().default(false),
    reviewReason: z.string().nullable().optional(),
    blockedReason: z.string().nullable().optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    resolvedAt: z.coerce.date().nullable().optional(),
    deletedAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (c) => c.ownerUserId != null || (c.ownerExternalName != null && c.ownerExternalName.length > 0),
    { message: "owner_present: ownerUserId or ownerExternalName required" },
  );

export type Commitment = z.infer<typeof commitmentSchema>;
export type CommitmentStatus = z.infer<typeof commitmentStatusSchema>;
