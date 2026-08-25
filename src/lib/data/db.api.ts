import { api } from "../api";
import type {
  Commitment,
  CommitmentStatus,
  Organization,
  Priority,
  Project,
  User,
  Connection,
  Report,
} from "../types";

/**
 * API-backed data plane. No mockDb spread — unwired methods throw so production
 * cannot silently read/write localStorage demo data when VITE_API_URL is set.
 */
function unwired(method: string): never {
  throw new Error(
    `[loop] apiDb.${method} is not wired to the Fastify API. Use an API client call or implement the route.`,
  );
}

function mapUser(u: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
  managerId?: string | null;
  status?: string;
}): User {
  return {
    id: u.id,
    org_id: u.tenantId,
    email: u.email,
    full_name: u.fullName,
    role: u.role as User["role"],
    status: (u.status as User["status"]) ?? "active",
    manager_id: u.managerId ?? null,
    phone_number: null,
    phone_verified_at: null,
    avatar_url: null,
    notification_prefs: { whatsapp_checkins: true },
    created_at: new Date().toISOString(),
    last_active_at: null,
  };
}

const apiDbImpl = {
  async listCommitments(orgId: string): Promise<Commitment[]> {
    void orgId;
    const res = await api.listCommitments();
    return res.items.map((c) => ({
      id: c.id,
      org_id: c.tenantId,
      project_id: c.projectId,
      title: c.title,
      description: null,
      owner_id: c.ownerUserId,
      owner_external_name: null,
      requested_by_id: null,
      source_type: "manual" as const,
      source_meeting_id: null,
      due_date: null,
      status: c.status as CommitmentStatus,
      priority: c.priority as Priority,
      last_checkin_at: null,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      resolved_at: null,
      needs_review: c.needsReview,
    }));
  },

  async getCommitment(id: string): Promise<Commitment | undefined> {
    const all = await apiDbImpl.listCommitments("");
    return all.find((c) => c.id === id);
  },

  async invokeAutonomySweep() {
    const res = await api.runSweep();
    return { checkins: 0, escalations: 0, notes: res.notes };
  },

  async getUser(id: string): Promise<User | undefined> {
    try {
      const me = await api.me();
      if (me.user.id === id) return mapUser(me.user);
      const users = await api.listUsers();
      const u = users.items.find((x) => x.id === id);
      return u ? mapUser(u) : undefined;
    } catch {
      return undefined;
    }
  },

  async getOrg(id: string): Promise<Organization | undefined> {
    try {
      const org = await api.getOrg();
      void id;
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: "pilot",
        created_at: new Date().toISOString(),
        settings: org.settings ?? {
          timezone: "Africa/Nairobi",
          escalation_sla_hours: 24,
        },
      };
    } catch {
      return undefined;
    }
  },

  async listUsers(orgId: string): Promise<User[]> {
    void orgId;
    const res = await api.listUsers();
    return res.items.map(mapUser);
  },

  async listProjects(orgId: string): Promise<Project[]> {
    void orgId;
    const res = await api.listProjects();
    return res.items.map((p) => ({
      id: p.id,
      org_id: p.tenantId,
      name: p.name,
      description: null,
      client_name: null,
      status: (p.status as Project["status"]) ?? "active",
      owner_id: null,
      created_at: new Date().toISOString(),
    }));
  },

  async getProject(id: string): Promise<Project | undefined> {
    const all = await apiDbImpl.listProjects("");
    return all.find((p) => p.id === id);
  },

  async listConnections(orgId: string): Promise<Connection[]> {
    void orgId;
    const res = await api.listConnections();
    return (
      res.items as Array<{
        id: string;
        tenantId: string;
        userId: string | null;
        provider: string;
        status: string;
        lastSyncedAt: string | null;
        externalAccountEmail: string | null;
      }>
    ).map((c) => ({
      id: c.id,
      org_id: c.tenantId,
      user_id: c.userId,
      provider: c.provider as Connection["provider"],
      status: c.status as Connection["status"],
      scopes: [],
      external_account_email: c.externalAccountEmail,
      connected_at: null,
      last_synced_at: c.lastSyncedAt,
      error_message: null,
    }));
  },

  async disconnectProvider(orgId: string, id: string): Promise<void> {
    void orgId;
    await api.disconnectConnection(id);
  },

  async listReports(orgId: string): Promise<Report[]> {
    void orgId;
    const res = await api.listReports();
    return res.items.map((r) => ({
      id: r.id,
      org_id: r.tenantId,
      type: r.type,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      content_md: r.contentMd,
      content_json: {},
      recipient_ids: [],
      sent_at: null,
      created_at: r.createdAt,
    }));
  },

  async getReport(id: string): Promise<Report | undefined> {
    const r = await api.getReport(id);
    return {
      id: r.id,
      org_id: r.tenantId,
      type: r.type,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      content_md: r.contentMd,
      content_json: {},
      recipient_ids: [],
      sent_at: null,
      created_at: r.createdAt,
    };
  },

  async listReviewQueue(orgId: string): Promise<Commitment[]> {
    void orgId;
    const res = await api.listReview();
    return res.items.map((item) => ({
      id: item.id,
      org_id: "",
      title: item.title,
      description: null,
      status: item.status as CommitmentStatus,
      priority: item.priority as Priority,
      needs_review: item.needsReview,
      owner_id: item.ownerUserId,
      project_id: item.projectId,
      due_date: null,
      owner_external_name: null,
      requested_by_id: null,
      source_type: "meeting" as const,
      source_meeting_id: null,
      source_quote: null,
      confidence_score: null,
      last_checkin_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
    }));
  },

  /** No-ops / empty until identity mutation routes exist — never touch mock store. */
  async updateUser() {
    return undefined;
  },
};

export const apiDb = new Proxy(apiDbImpl, {
  get(target, prop, receiver) {
    if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
    if (Object.prototype.hasOwnProperty.call(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    return (..._args: unknown[]) => unwired(String(prop));
  },
}) as unknown as typeof apiDbImpl;
