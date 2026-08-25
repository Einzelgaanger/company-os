import { z } from "zod";

export const userRoleSchema = z.enum(["member", "manager", "admin", "owner"]);
export const userStatusSchema = z.enum([
  "invited",
  "active",
  "suspended",
  "deprovisioned",
]);

export const userSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1),
  displayName: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  phoneE164: z.string().nullable().optional(),
  role: userRoleSchema.default("member"),
  managerId: z.string().uuid().nullable().optional(),
  status: userStatusSchema.default("invited"),
  noticeAcknowledgedAt: z.coerce.date().nullable().optional(),
  locale: z.string().default("en"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  deletedAt: z.coerce.date().nullable().optional(),
});

export type User = z.infer<typeof userSchema>;
