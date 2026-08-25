/**
 * A3 — legal records facade.
 *
 * `tenant_compliance` and `users.notice_acknowledged_at` are the only stores for
 * attestation and notice acknowledgement. Nothing legal is ever persisted in the
 * browser. Memory implementations exist solely so the suite can run without a
 * live Postgres; `storeMode` decides which one is live.
 */
import { storeMode } from "./index.js";
import {
  ackNotice,
  createMessageApproval,
  decideMessageApproval,
  getCompliance,
  getNoticeAck,
  getTenantStatus,
  listMessageApprovals,
  publishNotice,
  upsertCompliance,
} from "./memory.js";

export type ComplianceRecord = {
  tenantId: string;
  attestedByUserId: string | null;
  attestedAt: string | null;
  lawfulBasis: string;
  high_risk_use_prohibited: true;
  payload: Record<string, unknown>;
};

export type NoticeAckRecord = {
  userId: string;
  at: string;
  version: string | null;
};

export type MessageApprovalRecord = {
  id: string;
  tenantId: string;
  recipientUserId: string | null;
  templateKey: string;
  preview: string;
  status: string;
  createdAt: string;
};

const isPg = () => storeMode === "postgres";

export async function readCompliance(
  tenantId: string,
): Promise<ComplianceRecord | null> {
  if (!isPg()) return getCompliance(tenantId) ?? null;
  const { pgGetCompliance } = await import("./pg.js");
  const row = await pgGetCompliance(tenantId);
  if (!row?.attestedAt) return null;
  return {
    tenantId,
    attestedByUserId: row.attestedByUserId ?? null,
    attestedAt: row.attestedAt.toISOString(),
    lawfulBasis: row.lawfulBasis,
    high_risk_use_prohibited: true,
    payload: {
      dpiaCompleted: row.dpiaCompleted,
      liaCompleted: row.liaCompleted,
      worksCouncilRequired: row.worksCouncilRequired,
      worksCouncilConsulted: row.worksCouncilConsulted,
      employeeNoticePublished: row.employeeNoticePublished,
      employeeNoticeVersion: row.employeeNoticeVersion,
      dpoEmail: row.dpoEmail,
    },
  };
}

export async function writeCompliance(input: {
  tenantId: string;
  userId: string;
  payload: Record<string, unknown>;
}): Promise<ComplianceRecord> {
  const attestedAt = new Date().toISOString();
  const lawfulBasis = String(input.payload.lawfulBasis ?? "legitimate_interest");
  if (isPg()) {
    const { pgAttestCompliance } = await import("./pg.js");
    await pgAttestCompliance(input.tenantId, input.userId, input.payload);
    return {
      tenantId: input.tenantId,
      attestedByUserId: input.userId,
      attestedAt,
      lawfulBasis,
      high_risk_use_prohibited: true,
      payload: input.payload,
    };
  }
  return upsertCompliance({
    tenantId: input.tenantId,
    attestedByUserId: input.userId,
    attestedAt,
    lawfulBasis,
    high_risk_use_prohibited: true,
    payload: input.payload,
  });
}

export async function readNoticeAck(
  tenantId: string,
  userId: string,
): Promise<NoticeAckRecord | null> {
  if (!isPg()) {
    const row = getNoticeAck(userId);
    return row ? { userId: row.userId, at: row.at, version: row.version } : null;
  }
  const { pgGetNoticeAck } = await import("./pg.js");
  return pgGetNoticeAck(tenantId, userId);
}

export async function writeNoticeAck(
  tenantId: string,
  userId: string,
  version: string,
): Promise<NoticeAckRecord> {
  if (isPg()) {
    const { pgAckNotice } = await import("./pg.js");
    await pgAckNotice(tenantId, userId, version);
    return { userId, at: new Date().toISOString(), version };
  }
  const row = ackNotice(userId, version);
  return { userId: row.userId, at: row.at, version: row.version };
}

export async function publishNoticeVersion(
  tenantId: string,
  version: string,
): Promise<{ tenantId: string; version: string }> {
  if (isPg()) {
    const { pgPublishNotice } = await import("./pg.js");
    return pgPublishNotice(tenantId, version);
  }
  return publishNotice(tenantId, version);
}

export async function readTenantStatus(tenantId: string): Promise<string> {
  if (!isPg()) return getTenantStatus(tenantId);
  const { pgGetTenantStatus } = await import("./pg.js");
  return pgGetTenantStatus(tenantId);
}

export async function enqueueMessageApproval(input: {
  tenantId: string;
  templateKey: string;
  preview: string;
  recipientUserId: string | null;
  requestedByUserId: string;
}): Promise<MessageApprovalRecord> {
  if (isPg()) {
    const { pgCreateMessageApproval } = await import("./pg.js");
    const row = await pgCreateMessageApproval(input.tenantId, input);
    return {
      id: row.id,
      tenantId: row.tenantId,
      recipientUserId: row.recipientUserId,
      templateKey: row.templateKey,
      preview: row.preview,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
  return createMessageApproval(input);
}

export async function readMessageApprovals(
  tenantId: string,
): Promise<MessageApprovalRecord[]> {
  if (!isPg()) return listMessageApprovals(tenantId);
  const { pgListMessageApprovals } = await import("./pg.js");
  const rows = await pgListMessageApprovals(tenantId);
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    recipientUserId: row.recipientUserId,
    templateKey: row.templateKey,
    preview: row.preview,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function decideMessage(
  tenantId: string,
  id: string,
  approved: boolean,
  decidedByUserId: string,
): Promise<MessageApprovalRecord | null> {
  if (!isPg()) {
    return decideMessageApproval(tenantId, id, approved, decidedByUserId) ?? null;
  }
  const { pgDecideMessageApproval } = await import("./pg.js");
  const row = await pgDecideMessageApproval(tenantId, id, approved, decidedByUserId);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    recipientUserId: row.recipientUserId,
    templateKey: row.templateKey,
    preview: row.preview,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
