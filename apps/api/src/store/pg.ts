/**
 * Postgres-backed helpers for @loop/api (A1).
 * All tenant-scoped reads/writes go through withTenantContext so FORCE RLS applies.
 */
import { withTenantContext, schema } from "@loop/db";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import { hashPassword } from "../plugins/auth.js";

const { users, commitments, tenantCompliance, messageApprovals } = schema;

const ownerUrl =
  process.env.DATABASE_OWNER_URL ??
  "postgres://loop_owner:loop@127.0.0.1:5432/loop";

export async function pgFindUserByEmail(email: string): Promise<{
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  passwordHash: string;
} | null> {
  // Login needs cross-tenant email lookup before tid is known — owner connection,
  // then all subsequent work uses withTenantContext.
  const sqlOwner = postgres(ownerUrl, { max: 1 });
  try {
    const rows = await sqlOwner`
      SELECT id::text, tenant_id::text AS tid, email, full_name, role, password_hash
      FROM users
      WHERE lower(email) = lower(${email}) AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows[0] || !rows[0].password_hash) return null;
    return {
      id: String(rows[0].id),
      tenantId: String(rows[0].tid),
      email: String(rows[0].email),
      fullName: String(rows[0].full_name),
      role: String(rows[0].role),
      passwordHash: String(rows[0].password_hash),
    };
  } finally {
    await sqlOwner.end({ timeout: 2 });
  }
}

export async function pgListCommitments(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    return db.select().from(commitments);
  });
}

export async function pgCreateCommitment(
  tenantId: string,
  input: { title: string; ownerUserId: string },
) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .insert(commitments)
      .values({
        tenantId,
        title: input.title,
        ownerUserId: input.ownerUserId,
        sourceType: "manual",
        status: "open",
        reviewRequired: false,
        priority: "medium",
      })
      .returning();
    return row;
  });
}

export async function pgEnsureDemoSeed(): Promise<void> {
  const sqlOwner = postgres(ownerUrl, { max: 1 });
  const tenantId = "00000000-0000-0000-0000-000000000010";
  const userId = "00000000-0000-0000-0000-000000000001";
  const passwordHash = await hashPassword("LoopDemo2026!");
  try {
    await sqlOwner`
      INSERT INTO tenants (id, name, slug, status, plan)
      VALUES (${tenantId}::uuid, 'ProDG Studios', 'prodg', 'active', 'pilot')
      ON CONFLICT (id) DO UPDATE SET status = 'active'
    `;
    await sqlOwner`
      INSERT INTO users (id, tenant_id, email, full_name, role, status, password_hash)
      VALUES (
        ${userId}::uuid, ${tenantId}::uuid, 'alfred@prodg.studio',
        'Alfred Maweu', 'owner', 'active', ${passwordHash}
      )
      ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active'
    `;
    await sqlOwner`
      INSERT INTO tenant_compliance (tenant_id, lawful_basis, dpia_completed, lia_completed,
        employee_notice_published, high_risk_use_prohibited, attested_at)
      VALUES (
        ${tenantId}::uuid, 'legitimate_interest', true, true, true, true, now()
      )
      ON CONFLICT (tenant_id) DO NOTHING
    `;
    await sqlOwner`
      UPDATE users SET notice_acknowledged_at = now(), notice_version = '2026-08-v1'
      WHERE id = ${userId}::uuid
    `;
  } finally {
    await sqlOwner.end({ timeout: 2 });
  }
}

type LawfulBasis = "legitimate_interest" | "contract" | "legal_obligation";

const LAWFUL_BASES: readonly LawfulBasis[] = [
  "legitimate_interest",
  "contract",
  "legal_obligation",
];

function toLawfulBasis(value: unknown): LawfulBasis {
  return LAWFUL_BASES.includes(value as LawfulBasis)
    ? (value as LawfulBasis)
    : "legitimate_interest";
}

export async function pgAttestCompliance(
  tenantId: string,
  userId: string,
  payload: Record<string, unknown>,
) {
  return withTenantContext(tenantId, async (db) => {
    await db
      .insert(tenantCompliance)
      .values({
        tenantId,
        lawfulBasis: toLawfulBasis(payload.lawfulBasis),
        dpiaCompleted: Boolean(payload.dpiaCompleted),
        liaCompleted: Boolean(payload.liaCompleted),
        worksCouncilRequired: Boolean(payload.worksCouncilRequired),
        worksCouncilConsulted: Boolean(payload.worksCouncilConsulted),
        employeeNoticePublished: Boolean(payload.employeeNoticePublished),
        employeeNoticeVersion: payload.employeeNoticeVersion
          ? String(payload.employeeNoticeVersion)
          : null,
        dpoEmail: payload.dpoEmail ? String(payload.dpoEmail) : null,
        attestedByUserId: userId,
        attestedAt: new Date(),
        highRiskUseProhibited: true,
      })
      .onConflictDoUpdate({
        target: tenantCompliance.tenantId,
        set: {
          attestedByUserId: userId,
          attestedAt: new Date(),
          highRiskUseProhibited: true,
        },
      });
    return { high_risk_use_prohibited: true as const };
  });
}

export async function pgAckNotice(tenantId: string, userId: string, version: string) {
  return withTenantContext(tenantId, async (db) => {
    await db
      .update(users)
      .set({
        noticeAcknowledgedAt: new Date(),
        noticeVersion: version,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return { ok: true };
  });
}

/** A3 — tenant_compliance is the only attestation store. */
export async function pgGetCompliance(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .select()
      .from(tenantCompliance)
      .where(eq(tenantCompliance.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  });
}

/** A3 — users.notice_acknowledged_at is the only acknowledgement store. */
export async function pgGetNoticeAck(
  tenantId: string,
  userId: string,
): Promise<{ userId: string; at: string; version: string | null } | null> {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .select({
        at: users.noticeAcknowledgedAt,
        version: users.noticeVersion,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!row?.at) return null;
    return { userId, at: row.at.toISOString(), version: row.version ?? null };
  });
}

/** Publishing a new notice version clears acknowledgements so everyone re-acks. */
export async function pgPublishNotice(tenantId: string, version: string) {
  return withTenantContext(tenantId, async (db) => {
    await db
      .update(tenantCompliance)
      .set({ employeeNoticeVersion: version, employeeNoticePublished: true })
      .where(eq(tenantCompliance.tenantId, tenantId));
    await db
      .update(users)
      .set({ noticeAcknowledgedAt: null, noticeVersion: null, updatedAt: new Date() })
      .where(eq(users.tenantId, tenantId));
    return { tenantId, version };
  });
}

/**
 * Tenant status drives the provisioning gate. Read on the owner connection:
 * `tenants` has no tenant_id column, so RLS context does not apply to it.
 */
export async function pgGetTenantStatus(tenantId: string): Promise<string> {
  const sqlOwner = postgres(ownerUrl, { max: 1 });
  try {
    const rows = await sqlOwner`
      SELECT status FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
    `;
    return rows[0] ? String(rows[0].status) : "provisioning";
  } finally {
    await sqlOwner.end({ timeout: 2 });
  }
}

export async function pgCreateMessageApproval(
  tenantId: string,
  input: {
    templateKey: string;
    preview: string;
    recipientUserId: string | null;
    requestedByUserId: string;
  },
) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .insert(messageApprovals)
      .values({
        tenantId,
        templateKey: input.templateKey,
        preview: input.preview,
        recipientUserId: input.recipientUserId,
        requestedByUserId: input.requestedByUserId,
        status: "pending",
      })
      .returning();
    return row;
  });
}

export async function pgListMessageApprovals(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    return db
      .select()
      .from(messageApprovals)
      .where(eq(messageApprovals.tenantId, tenantId));
  });
}

export async function pgDecideMessageApproval(
  tenantId: string,
  id: string,
  approved: boolean,
  decidedByUserId: string,
) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .update(messageApprovals)
      .set({
        status: approved ? "approved" : "rejected",
        decidedByUserId,
        decidedAt: new Date(),
      })
      .where(
        and(eq(messageApprovals.id, id), eq(messageApprovals.tenantId, tenantId)),
      )
      .returning();
    return row ?? null;
  });
}
