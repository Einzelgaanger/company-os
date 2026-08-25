import { z } from "zod";
import { HIGH_RISK_USE_PROHIBITED, MIN_SURVEY_N } from "../guards.js";

export const tenantPlanSchema = z.enum(["pilot", "starter", "growth", "enterprise"]);
export const tenantStatusSchema = z.enum([
  "provisioning",
  "active",
  "suspended",
  "offboarding",
]);
export const isolationTierSchema = z.enum(["pooled", "silo"]);

export const tenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  isolationTier: isolationTierSchema.default("pooled"),
  plan: tenantPlanSchema.default("pilot"),
  seatLimit: z.number().int().positive().nullable().optional(),
  status: tenantStatusSchema.default("provisioning"),
  createdAt: z.coerce.date(),
});

export type Tenant = z.infer<typeof tenantSchema>;

export const tenantComplianceSchema = z.object({
  tenantId: z.string().uuid(),
  lawfulBasis: z
    .enum(["legitimate_interest", "contract", "legal_obligation"])
    .default("legitimate_interest"),
  dpiaCompleted: z.boolean().default(false),
  liaCompleted: z.boolean().default(false),
  employeeNoticePublished: z.boolean().default(false),
  /** C-1: always true; not settable via UI. */
  highRiskUseProhibited: z.literal(true).default(HIGH_RISK_USE_PROHIBITED),
  attestedByUserId: z.string().uuid().nullable().optional(),
  attestedAt: z.coerce.date().nullable().optional(),
});

export type TenantCompliance = z.infer<typeof tenantComplianceSchema>;
