import { store } from "./store";
import { nowIso, uuid } from "../utils";
import { classify } from "../classify";
import type {
  AppNotification,
  AuditLogEntry,
  AuthSessionRow,
  Checkin,
  Commitment,
  CommitmentDependency,
  CommitmentFeedback,
  CommitmentStatus,
  CommitmentStatusHistory,
  Connection,
  ConnectionProvider,
  DataAccessAction,
  DataAccessLogEntry,
  DsrRequest,
  DsrStatus,
  Escalation,
  FeedbackLabel,
  Meeting,
  MessagingMetrics,
  Milestone,
  Organization,
  OrgTeam,
  OwnershipMapEntry,
  Priority,
  Project,
  Report,
  Role,
  Sensitivity,
  StatusHistoryChannel,
  SurveyAnswer,
  SurveyCycle,
  Tag,
  User,
} from "../types";
import { clearanceFor, roleAtLeast, SENSITIVITY_RANK } from "../types";

// Small async wrapper so pages can `await` and later swap in a Supabase adapter
// that shares this exact signature.
function ok<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 120));
}

function audit(
  orgId: string,
  actor: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
) {
  const entry: AuditLogEntry = {
    id: uuid(),
    org_id: orgId,
    actor,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
    created_at: nowIso(),
  };
  store.set("audit_log", [entry, ...store.all("audit_log")]);
}

function notify(n: Omit<AppNotification, "id" | "created_at" | "read_at">) {
  const entry: AppNotification = {
    ...n,
    id: uuid(),
    read_at: null,
    created_at: nowIso(),
  };
  store.set("notifications", [entry, ...store.all("notifications")]);
}

// --- Org & users -----------------------------------------------------------

export const mockDb = {
  async getOrg(orgId: string): Promise<Organization | undefined> {
    return ok(store.all("organizations").find((o) => o.id === orgId));
  },

  async updateOrg(orgId: string, patch: Partial<Organization>): Promise<Organization> {
    const rows = store.all("organizations").map((o) =>
      o.id === orgId ? { ...o, ...patch, settings: { ...o.settings, ...patch.settings } } : o
    );
    store.set("organizations", rows);
    audit(orgId, "system", "organization.updated", "organization", orgId);
    return ok(rows.find((o) => o.id === orgId)!);
  },

  async getUser(userId: string): Promise<User | undefined> {
    return ok(store.all("users").find((u) => u.id === userId));
  },

  async listUsers(orgId: string): Promise<User[]> {
    return ok(store.all("users").filter((u) => u.org_id === orgId));
  },

  async updateUser(userId: string, patch: Partial<User>): Promise<User> {
    const rows = store.all("users").map((u) => (u.id === userId ? { ...u, ...patch } : u));
    store.set("users", rows);
    return ok(rows.find((u) => u.id === userId)!);
  },

  async changeRole(actor: User, userId: string, role: Role): Promise<User> {
    const user = await mockDb.updateUser(userId, { role });
    audit(actor.org_id, actor.id, "role.changed", "user", userId, { role });
    return user;
  },

  async setManager(userId: string, managerId: string | null): Promise<User> {
    return mockDb.updateUser(userId, { manager_id: managerId });
  },

  async bootstrapOrganization(_name: string, _fullName?: string): Promise<string> {
    throw new Error("Use createOrganization in mock mode.");
  },

  async acceptInvite(_token: string, _fullName?: string): Promise<string> {
    throw new Error("Invite accept is handled in mock AuthContext.");
  },

  async createInboundCheckin(input: Omit<Checkin, "id" | "created_at" | "twilio_sid">): Promise<Checkin> {
    const checkin: Checkin = {
      ...input,
      id: uuid(),
      twilio_sid: null,
      created_at: nowIso(),
    };
    store.set("checkins", [...store.all("checkins"), checkin]);
    return ok(checkin);
  },

  async invokeAutonomySweep(): Promise<{ checkins: number; escalations: number }> {
    return { checkins: 0, escalations: 0 };
  },

  async inviteUser(
    actor: User,
    email: string,
    role: Role,
    managerId: string | null
  ): Promise<User> {
    const user: User = {
      id: uuid(),
      org_id: actor.org_id,
      full_name: email.split("@")[0],
      email,
      phone_number: null,
      phone_verified_at: null,
      role,
      manager_id: managerId,
      status: "invited",
      avatar_url: null,
      notification_prefs: { whatsapp_checkins: true },
      created_at: nowIso(),
      last_active_at: null,
    };
    store.set("users", [...store.all("users"), user]);
    audit(actor.org_id, actor.id, "user.invited", "user", user.id, { email, role });
    return ok(user);
  },

  // --- Projects ------------------------------------------------------------

  async listProjects(orgId: string): Promise<Project[]> {
    return ok(store.all("projects").filter((p) => p.org_id === orgId));
  },

  async getProject(id: string): Promise<Project | undefined> {
    return ok(store.all("projects").find((p) => p.id === id));
  },

  async createProject(input: Omit<Project, "id" | "created_at">): Promise<Project> {
    const project: Project = { ...input, id: uuid(), created_at: nowIso() };
    store.set("projects", [...store.all("projects"), project]);
    audit(project.org_id, project.owner_id ?? "system", "project.created", "project", project.id);
    return ok(project);
  },

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    const rows = store.all("projects").map((p) => (p.id === id ? { ...p, ...patch } : p));
    store.set("projects", rows);
    return ok(rows.find((p) => p.id === id)!);
  },

  // --- Commitments ---------------------------------------------------------

  async listCommitments(orgId: string): Promise<Commitment[]> {
    return ok(store.all("commitments").filter((c) => c.org_id === orgId));
  },

  async getCommitment(id: string): Promise<Commitment | undefined> {
    return ok(store.all("commitments").find((c) => c.id === id));
  },

  async createCommitment(
    input: Omit<Commitment, "id" | "created_at" | "updated_at" | "resolved_at" | "last_checkin_at">
  ): Promise<Commitment> {
    // Auto-classify on ingest if not already classified, so nothing enters
    // untagged. In production the extract-commitments edge function does this
    // via Claude; here we use the shared heuristic.
    let { sensitivity, tag_ids, classified_by } = input;
    if (!sensitivity) {
      const guess = classify(input.title, input.description);
      const byName = new Map(store.all("tags").filter((t) => t.org_id === input.org_id).map((t) => [t.name, t.id]));
      sensitivity = guess.sensitivity;
      tag_ids = guess.tags.map((n) => byName.get(n)).filter(Boolean) as string[];
      classified_by = "system";
    }
    const c: Commitment = {
      ...input,
      sensitivity,
      tag_ids: tag_ids ?? [],
      classified_by: classified_by ?? null,
      confidence_score: input.confidence_score ?? null,
      needs_review: input.needs_review ?? false,
      source_quote: input.source_quote ?? null,
      snoozed_until: input.snoozed_until ?? null,
      id: uuid(),
      last_checkin_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      resolved_at: null,
    };
    store.set("commitments", [...store.all("commitments"), c]);
    audit(c.org_id, c.requested_by_id ?? "system", "commitment.created", "commitment", c.id);
    void mockDb.appendStatusHistory(c.org_id, c.id, null, c.status, "ui", c.requested_by_id, "Created");
    return ok(c);
  },

  async updateCommitment(id: string, patch: Partial<Commitment>): Promise<Commitment> {
    const prev = store.all("commitments").find((c) => c.id === id);
    const rows = store
      .all("commitments")
      .map((c) => (c.id === id ? { ...c, ...patch, updated_at: nowIso() } : c));
    store.set("commitments", rows);
    const next = rows.find((c) => c.id === id)!;
    if (prev && patch.status && patch.status !== prev.status) {
      void mockDb.appendStatusHistory(next.org_id, id, prev.status, patch.status, "ui", null, null);
    }
    return ok(next);
  },

  async markCommitmentDone(actor: User, id: string): Promise<Commitment> {
    const c = await mockDb.updateCommitment(id, {
      status: "done",
      resolved_at: nowIso(),
      needs_review: false,
    });
    audit(actor.org_id, actor.id, "commitment.done", "commitment", id);
    return c;
  },

  async listReviewQueue(orgId: string): Promise<Commitment[]> {
    return ok(
      store
        .all("commitments")
        .filter((c) => c.org_id === orgId && c.needs_review && c.status !== "done")
        .sort((a, b) => (a.confidence_score ?? 0) - (b.confidence_score ?? 0))
    );
  },

  async approveReview(actor: User, id: string): Promise<Commitment> {
    const c = await mockDb.updateCommitment(id, { needs_review: false });
    audit(actor.org_id, actor.id, "commitment.review_approved", "commitment", id);
    await mockDb.appendStatusHistory(actor.org_id, id, c.status, c.status, "ui", actor.id, "Approved from review queue");
    return c;
  },

  async rejectReview(actor: User, id: string): Promise<Commitment> {
    const prev = await mockDb.getCommitment(id);
    const c = await mockDb.updateCommitment(id, {
      needs_review: false,
      status: "done",
      resolved_at: nowIso(),
    });
    if (prev) {
      await mockDb.appendStatusHistory(actor.org_id, id, prev.status, "done", "ui", actor.id, "Rejected from review queue");
    }
    audit(actor.org_id, actor.id, "commitment.review_rejected", "commitment", id);
    return c;
  },

  async listDependencies(commitmentId: string): Promise<CommitmentDependency[]> {
    return ok(store.all("commitment_dependencies").filter((d) => d.commitment_id === commitmentId));
  },

  async addDependency(orgId: string, commitmentId: string, blockedById: string): Promise<CommitmentDependency> {
    if (commitmentId === blockedById) throw new Error("A commitment cannot block itself.");
    const existing = store
      .all("commitment_dependencies")
      .find((d) => d.commitment_id === commitmentId && d.blocked_by_id === blockedById);
    if (existing) return ok(existing);
    const dep: CommitmentDependency = {
      id: uuid(),
      org_id: orgId,
      commitment_id: commitmentId,
      blocked_by_id: blockedById,
      created_at: nowIso(),
    };
    store.set("commitment_dependencies", [...store.all("commitment_dependencies"), dep]);
    return ok(dep);
  },

  async removeDependency(id: string): Promise<void> {
    store.set(
      "commitment_dependencies",
      store.all("commitment_dependencies").filter((d) => d.id !== id)
    );
    return ok(undefined);
  },

  async submitFeedback(
    actor: User,
    commitmentId: string,
    label: FeedbackLabel,
    errorCategory?: string | null,
    note?: string | null
  ): Promise<CommitmentFeedback> {
    const fb: CommitmentFeedback = {
      id: uuid(),
      org_id: actor.org_id,
      commitment_id: commitmentId,
      actor_id: actor.id,
      label,
      error_category: errorCategory ?? null,
      note: note ?? null,
      created_at: nowIso(),
    };
    store.set("commitment_feedback", [fb, ...store.all("commitment_feedback")]);
    audit(actor.org_id, actor.id, "commitment.feedback", "commitment", commitmentId, { label, errorCategory });
    return ok(fb);
  },

  async listFeedback(commitmentId: string): Promise<CommitmentFeedback[]> {
    return ok(
      store
        .all("commitment_feedback")
        .filter((f) => f.commitment_id === commitmentId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },

  async appendStatusHistory(
    orgId: string,
    commitmentId: string,
    fromStatus: string | null,
    toStatus: string,
    channel: StatusHistoryChannel,
    actorId: string | null,
    note: string | null
  ): Promise<CommitmentStatusHistory> {
    const row: CommitmentStatusHistory = {
      id: uuid(),
      org_id: orgId,
      commitment_id: commitmentId,
      from_status: fromStatus,
      to_status: toStatus,
      channel,
      actor_id: actorId,
      note,
      created_at: nowIso(),
    };
    store.set("commitment_status_history", [row, ...store.all("commitment_status_history")]);
    return ok(row);
  },

  async listStatusHistory(commitmentId: string): Promise<CommitmentStatusHistory[]> {
    return ok(
      store
        .all("commitment_status_history")
        .filter((h) => h.commitment_id === commitmentId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },

  // --- Meetings ------------------------------------------------------------

  async listMeetings(orgId: string): Promise<Meeting[]> {
    return ok(store.all("meetings").filter((m) => m.org_id === orgId));
  },

  async getMeeting(id: string): Promise<Meeting | undefined> {
    return ok(store.all("meetings").find((m) => m.id === id));
  },

  // --- Check-ins -----------------------------------------------------------

  async listCheckins(orgId: string): Promise<Checkin[]> {
    return ok(store.all("checkins").filter((c) => c.org_id === orgId));
  },

  async listCheckinsForCommitment(commitmentId: string): Promise<Checkin[]> {
    return ok(
      store
        .all("checkins")
        .filter((c) => c.commitment_id === commitmentId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    );
  },

  async listCheckinsForUser(userId: string): Promise<Checkin[]> {
    return ok(
      store
        .all("checkins")
        .filter((c) => c.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },

  /** Mock "send check-in now" — records an outbound message (Phase 3 wires Twilio). */
  async sendCheckin(actor: User, targetUserId: string, commitmentId: string | null, text: string) {
    const checkin: Checkin = {
      id: uuid(),
      org_id: actor.org_id,
      user_id: targetUserId,
      commitment_id: commitmentId,
      direction: "outbound",
      channel: "whatsapp",
      message_type: commitmentId ? "direct_followup" : "progress_ping",
      message_text: text,
      parsed_status: null,
      parsed_blocker: null,
      twilio_sid: `SM-mock-${uuid().slice(0, 8)}`,
      created_at: nowIso(),
    };
    store.set("checkins", [...store.all("checkins"), checkin]);
    if (commitmentId) {
      await mockDb.updateCommitment(commitmentId, { last_checkin_at: nowIso() });
    }
    audit(actor.org_id, actor.id, "checkin.sent", "checkin", checkin.id, { targetUserId });
    return ok(checkin);
  },

  // --- Escalations ---------------------------------------------------------

  async listEscalations(orgId: string): Promise<Escalation[]> {
    return ok(store.all("escalations").filter((e) => e.org_id === orgId));
  },

  async getEscalation(id: string): Promise<Escalation | undefined> {
    return ok(store.all("escalations").find((e) => e.id === id));
  },

  async acknowledgeEscalation(actor: User, id: string): Promise<Escalation> {
    const rows = store
      .all("escalations")
      .map((e) =>
        e.id === id ? { ...e, status: "acknowledged" as const, acknowledged_at: nowIso() } : e
      );
    store.set("escalations", rows);
    const esc = rows.find((e) => e.id === id)!;
    const commitment = store.all("commitments").find((c) => c.id === esc.commitment_id);
    if (commitment?.requested_by_id) {
      notify({
        org_id: actor.org_id,
        user_id: commitment.requested_by_id,
        kind: "escalation",
        title: "Someone's on it",
        body: `${actor.full_name} acknowledged the escalation for "${commitment.title}".`,
        link: `/escalations/${id}`,
      });
    }
    audit(actor.org_id, actor.id, "escalation.acknowledged", "escalation", id);
    return ok(esc);
  },

  async resolveEscalation(actor: User, id: string, note: string): Promise<Escalation> {
    const rows = store
      .all("escalations")
      .map((e) =>
        e.id === id ? { ...e, status: "resolved" as const, resolved_at: nowIso() } : e
      );
    store.set("escalations", rows);
    const esc = rows.find((e) => e.id === id)!;
    await mockDb.updateCommitment(esc.commitment_id, { status: "in_progress" });
    const commitment = store.all("commitments").find((c) => c.id === esc.commitment_id);
    if (commitment?.requested_by_id) {
      notify({
        org_id: actor.org_id,
        user_id: commitment.requested_by_id,
        kind: "escalation",
        title: "Escalation resolved",
        body: `${commitment.title}: ${note}`,
        link: `/commitments/${esc.commitment_id}`,
      });
    }
    audit(actor.org_id, actor.id, "escalation.resolved", "escalation", id, { note });
    return ok(esc);
  },

  // --- Ownership map -------------------------------------------------------

  async listOwnershipMap(orgId: string): Promise<OwnershipMapEntry[]> {
    return ok(store.all("ownership_map").filter((o) => o.org_id === orgId));
  },

  async upsertOwnershipEntry(entry: OwnershipMapEntry): Promise<OwnershipMapEntry> {
    const existing = store.all("ownership_map").find((o) => o.id === entry.id);
    if (existing) {
      store.set(
        "ownership_map",
        store.all("ownership_map").map((o) => (o.id === entry.id ? entry : o))
      );
    } else {
      store.set("ownership_map", [...store.all("ownership_map"), entry]);
    }
    audit(entry.org_id, "system", "ownership_map.updated", "ownership_map", entry.id);
    return ok(entry);
  },

  async removeOwnershipEntry(id: string): Promise<void> {
    store.set(
      "ownership_map",
      store.all("ownership_map").filter((o) => o.id !== id)
    );
    return ok(undefined);
  },

  // --- Reports -------------------------------------------------------------

  async listReports(orgId: string): Promise<Report[]> {
    return ok(store.all("reports").filter((r) => r.org_id === orgId));
  },

  async getReport(id: string): Promise<Report | undefined> {
    return ok(store.all("reports").find((r) => r.id === id));
  },

  // --- Connections ---------------------------------------------------------

  async listConnections(orgId: string): Promise<Connection[]> {
    return ok(store.all("connections").filter((c) => c.org_id === orgId));
  },

  async connectProvider(
    orgId: string,
    userId: string | null,
    provider: ConnectionProvider,
    email: string
  ): Promise<Connection> {
    const existing = store
      .all("connections")
      .find((c) => c.org_id === orgId && c.provider === provider && c.user_id === userId);
    const conn: Connection = {
      id: existing?.id ?? uuid(),
      org_id: orgId,
      user_id: userId,
      provider,
      status: "connected",
      scopes: [],
      external_account_email: email,
      connected_at: nowIso(),
      last_synced_at: nowIso(),
      error_message: null,
    };
    if (existing) {
      store.set(
        "connections",
        store.all("connections").map((c) => (c.id === existing.id ? conn : c))
      );
    } else {
      store.set("connections", [...store.all("connections"), conn]);
    }
    audit(orgId, userId ?? "system", "connection.connected", "connection", conn.id, { provider });
    return ok(conn);
  },

  async disconnectProvider(orgId: string, id: string): Promise<void> {
    store.set(
      "connections",
      store
        .all("connections")
        .map((c) => (c.id === id ? { ...c, status: "disconnected" as const } : c))
    );
    audit(orgId, "system", "connection.revoked", "connection", id);
    return ok(undefined);
  },

  // --- Notifications -------------------------------------------------------

  async listNotifications(userId: string): Promise<AppNotification[]> {
    return ok(
      store
        .all("notifications")
        .filter((n) => n.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },

  async markNotificationRead(id: string): Promise<void> {
    store.set(
      "notifications",
      store.all("notifications").map((n) => (n.id === id ? { ...n, read_at: nowIso() } : n))
    );
    return ok(undefined);
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    store.set(
      "notifications",
      store
        .all("notifications")
        .map((n) => (n.user_id === userId && !n.read_at ? { ...n, read_at: nowIso() } : n))
    );
    return ok(undefined);
  },

  // --- Audit ---------------------------------------------------------------

  async listAuditLog(orgId: string): Promise<AuditLogEntry[]> {
    return ok(
      store
        .all("audit_log")
        .filter((a) => a.org_id === orgId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },

  // --- Governance: tags ----------------------------------------------------

  async listTags(orgId: string): Promise<Tag[]> {
    return ok(store.all("tags").filter((t) => t.org_id === orgId));
  },

  async createTag(input: Omit<Tag, "id" | "created_at">): Promise<Tag> {
    const tag: Tag = { ...input, id: uuid(), created_at: nowIso() };
    store.set("tags", [...store.all("tags"), tag]);
    audit(tag.org_id, "system", "tag.created", "tag", tag.id, { name: tag.name });
    return ok(tag);
  },

  async updateTag(id: string, patch: Partial<Tag>): Promise<Tag> {
    const rows = store.all("tags").map((t) => (t.id === id ? { ...t, ...patch } : t));
    store.set("tags", rows);
    return ok(rows.find((t) => t.id === id)!);
  },

  async deleteTag(id: string): Promise<void> {
    store.set("tags", store.all("tags").filter((t) => t.id !== id));
    // Detach from any commitments/meetings/projects.
    for (const table of ["commitments", "meetings", "projects"] as const) {
      store.set(
        table,
        (store.all(table) as any[]).map((row) =>
          row.tag_ids?.includes(id) ? { ...row, tag_ids: row.tag_ids.filter((t: string) => t !== id) } : row
        ) as any
      );
    }
    return ok(undefined);
  },

  // --- Governance: classification -----------------------------------------

  async classifyCommitment(
    actor: User,
    id: string,
    sensitivity: Sensitivity,
    tagIds: string[]
  ): Promise<Commitment> {
    const c = await mockDb.updateCommitment(id, { sensitivity, tag_ids: tagIds, classified_by: "user" });
    await mockDb.logDataAccess(actor, "commitment", id, sensitivity, "reclassify");
    audit(actor.org_id, actor.id, "data.reclassified", "commitment", id, { sensitivity, tags: tagIds });
    return c;
  },

  async classifyMeeting(actor: User, id: string, sensitivity: Sensitivity, tagIds: string[]): Promise<void> {
    store.set(
      "meetings",
      store.all("meetings").map((m) => (m.id === id ? { ...m, sensitivity, tag_ids: tagIds } : m))
    );
    audit(actor.org_id, actor.id, "data.reclassified", "meeting", id, { sensitivity, tags: tagIds });
    return ok(undefined);
  },

  // --- Governance: data-access log ----------------------------------------

  async logDataAccess(
    actor: User,
    entityType: DataAccessLogEntry["entity_type"],
    entityId: string,
    sensitivity: Sensitivity,
    action: DataAccessAction
  ): Promise<void> {
    // Only log access to sensitive material to keep the trail signal-rich.
    if (SENSITIVITY_RANK[sensitivity] < SENSITIVITY_RANK.confidential && action === "view") {
      return ok(undefined);
    }
    const entry: DataAccessLogEntry = {
      id: uuid(),
      org_id: actor.org_id,
      actor_id: actor.id,
      entity_type: entityType,
      entity_id: entityId,
      sensitivity,
      action,
      created_at: nowIso(),
    };
    store.set("data_access_log", [entry, ...store.all("data_access_log")]);
    return ok(undefined);
  },

  async listDataAccessLog(orgId: string): Promise<DataAccessLogEntry[]> {
    return ok(
      store
        .all("data_access_log")
        .filter((d) => d.org_id === orgId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },

  async discardReview(actor: User, id: string): Promise<Commitment> {
    return mockDb.rejectReview(actor, id);
  },

  async editThenConfirmReview(
    actor: User,
    id: string,
    patch: Partial<Commitment>,
  ): Promise<Commitment> {
    await mockDb.updateCommitment(id, { ...patch, needs_review: false });
    const c = (await mockDb.getCommitment(id))!;
    audit(actor.org_id, actor.id, "commitment.review_edited", "commitment", id, patch as Record<string, unknown>);
    return ok(c);
  },

  async reassignCommitment(actor: User, id: string, ownerId: string): Promise<Commitment> {
    const c = await mockDb.updateCommitment(id, { owner_id: ownerId, owner_external_name: null });
    audit(actor.org_id, actor.id, "commitment.reassigned", "commitment", id, { ownerId });
    return c;
  },

  async listMilestones(projectId: string): Promise<Milestone[]> {
    return ok(store.all("milestones").filter((m) => m.project_id === projectId));
  },

  async upsertMilestone(entry: Milestone): Promise<Milestone> {
    const rows = store.all("milestones");
    const exists = rows.some((m) => m.id === entry.id);
    store.set(
      "milestones",
      exists ? rows.map((m) => (m.id === entry.id ? entry : m)) : [...rows, entry],
    );
    audit(entry.org_id, "system", "milestone.upserted", "milestone", entry.id);
    return ok(entry);
  },

  async removeMilestone(id: string): Promise<void> {
    store.set(
      "milestones",
      store.all("milestones").filter((m) => m.id !== id),
    );
    return ok(undefined);
  },

  async listSurveyCycles(orgId: string): Promise<SurveyCycle[]> {
    return ok(store.all("survey_cycles").filter((s) => s.org_id === orgId));
  },

  async getSurveyCycle(id: string): Promise<SurveyCycle | undefined> {
    return ok(store.all("survey_cycles").find((s) => s.id === id));
  },

  async getCurrentSurvey(orgId: string): Promise<SurveyCycle | undefined> {
    return ok(store.all("survey_cycles").find((s) => s.org_id === orgId && s.status === "live"));
  },

  async submitSurveyAnswer(answer: SurveyAnswer): Promise<SurveyAnswer> {
    store.set("survey_answers", [...store.all("survey_answers"), answer]);
    const cycles = store.all("survey_cycles").map((c) =>
      c.id === answer.cycle_id ? { ...c, response_count: c.response_count + 1 } : c,
    );
    store.set("survey_cycles", cycles);
    return ok(answer);
  },

  async hasSurveyAnswer(cycleId: string, userId: string): Promise<boolean> {
    return ok(
      store.all("survey_answers").some((a) => a.cycle_id === cycleId && a.user_id === userId),
    );
  },

  async reviewSurveyQuestion(
    cycleId: string,
    questionId: string,
    approved: boolean,
  ): Promise<SurveyCycle> {
    const cycles = store.all("survey_cycles").map((c) => {
      if (c.id !== cycleId) return c;
      return {
        ...c,
        questions: c.questions.map((q) => (q.id === questionId ? { ...q, approved } : q)),
      };
    });
    store.set("survey_cycles", cycles);
    return ok(cycles.find((c) => c.id === cycleId)!);
  },

  async publishSurveyCycle(cycleId: string): Promise<SurveyCycle> {
    const cycles = store.all("survey_cycles").map((c) =>
      c.id === cycleId
        ? {
            ...c,
            status: "live" as const,
            opens_at: nowIso(),
            questions: c.questions.map((q) => ({ ...q, approved: q.approved !== false })),
          }
        : c,
    );
    store.set("survey_cycles", cycles);
    return ok(cycles.find((c) => c.id === cycleId)!);
  },

  async listDsrRequests(orgId: string): Promise<DsrRequest[]> {
    return ok(store.all("dsr_requests").filter((d) => d.org_id === orgId));
  },

  async createDsrRequest(
    input: Omit<DsrRequest, "id" | "created_at" | "resolved_at" | "status" | "due_at"> & {
      status?: DsrStatus;
      due_at?: string | null;
    },
  ): Promise<DsrRequest> {
    const created = nowIso();
    const due = new Date(created);
    due.setDate(due.getDate() + 30);
    const row: DsrRequest = {
      id: uuid(),
      status: input.status ?? "open",
      created_at: created,
      due_at: input.due_at ?? due.toISOString(),
      resolved_at: null,
      org_id: input.org_id,
      user_id: input.user_id,
      type: input.type,
      detail: input.detail,
    };
    store.set("dsr_requests", [row, ...store.all("dsr_requests")]);
    const admins = store
      .all("users")
      .filter((u) => u.org_id === input.org_id && roleAtLeast(u.role, "admin"));
    for (const a of admins) {
      notify({
        org_id: input.org_id,
        user_id: a.id,
        kind: "system",
        title: "New data subject request",
        body: `${input.type} request from a team member`,
        link: "/settings/security",
      });
    }
    audit(input.org_id, input.user_id, "dsr.created", "dsr_request", row.id, { type: input.type });
    return ok(row);
  },

  async updateDsrRequest(id: string, patch: Partial<DsrRequest>): Promise<DsrRequest> {
    const rows = store.all("dsr_requests").map((d) => (d.id === id ? { ...d, ...patch } : d));
    store.set("dsr_requests", rows);
    return ok(rows.find((d) => d.id === id)!);
  },

  async getMessagingMetrics(orgId: string): Promise<MessagingMetrics | undefined> {
    return ok(store.all("messaging_metrics").find((m) => m.org_id === orgId));
  },

  async listOrgTeams(orgId: string): Promise<OrgTeam[]> {
    return ok(store.all("org_teams").filter((t) => t.org_id === orgId));
  },

  async upsertOrgTeam(team: OrgTeam): Promise<OrgTeam> {
    const rows = store.all("org_teams");
    const exists = rows.some((t) => t.id === team.id);
    store.set(
      "org_teams",
      exists ? rows.map((t) => (t.id === team.id ? team : t)) : [...rows, team],
    );
    return ok(team);
  },

  async removeOrgTeam(id: string): Promise<void> {
    store.set(
      "org_teams",
      store.all("org_teams").filter((t) => t.id !== id),
    );
    return ok(undefined);
  },

  async listAuthSessions(orgId: string, userId?: string): Promise<AuthSessionRow[]> {
    return ok(
      store
        .all("auth_sessions")
        .filter((s) => s.org_id === orgId && (!userId || s.user_id === userId) && !s.revoked_at),
    );
  },

  async revokeAuthSession(id: string): Promise<void> {
    store.set(
      "auth_sessions",
      store.all("auth_sessions").map((s) =>
        s.id === id ? { ...s, revoked_at: nowIso() } : s,
      ),
    );
    return ok(undefined);
  },

  async rerouteEscalation(actor: User, id: string, toUserId: string): Promise<Escalation> {
    const rows = store.all("escalations").map((e) =>
      e.id === id ? { ...e, escalated_to_id: toUserId } : e,
    );
    store.set("escalations", rows);
    audit(actor.org_id, actor.id, "escalation.rerouted", "escalation", id, { toUserId });
    notify({
      org_id: actor.org_id,
      user_id: toUserId,
      kind: "escalation",
      title: "Escalation re-routed to you",
      body: "An open escalation was assigned to you.",
      link: `/escalations/${id}`,
    });
    return ok(rows.find((e) => e.id === id)!);
  },

  async escalateNow(actor: User, commitmentId: string, toUserId: string, reason: string): Promise<Escalation> {
    const commitment = store.all("commitments").find((c) => c.id === commitmentId)!;
    const checkins = store.all("checkins").filter((c) => c.commitment_id === commitmentId);
    const esc: Escalation = {
      id: uuid(),
      org_id: actor.org_id,
      commitment_id: commitmentId,
      escalated_to_id: toUserId,
      reason,
      context_snapshot: {
        commitment,
        checkins,
        reason,
        sla_hours_elapsed: 0,
      },
      status: "open",
      created_at: nowIso(),
      acknowledged_at: null,
      resolved_at: null,
    };
    store.set("escalations", [esc, ...store.all("escalations")]);
    await mockDb.updateCommitment(commitmentId, { status: "escalated" });
    notify({
      org_id: actor.org_id,
      user_id: toUserId,
      kind: "escalation",
      title: "New escalation",
      body: commitment.title,
      link: `/escalations/${esc.id}`,
    });
    audit(actor.org_id, actor.id, "escalation.created", "escalation", esc.id);
    return ok(esc);
  },
};

// --- Scoping helpers (Section 4) ------------------------------------------

/** Users the viewer is allowed to see commitments/check-ins for. */
export function scopedUserIds(viewer: User, allUsers: User[]): string[] {
  if (roleAtLeast(viewer.role, "admin")) return allUsers.map((u) => u.id);
  if (viewer.role === "manager") {
    const reports = allUsers.filter((u) => u.manager_id === viewer.id).map((u) => u.id);
    return [viewer.id, ...reports];
  }
  return [viewer.id];
}

export function visibleCommitments(
  viewer: User,
  all: Commitment[],
  allUsers: User[]
): Commitment[] {
  const ids = new Set(scopedUserIds(viewer, allUsers));
  const roleScoped = roleAtLeast(viewer.role, "admin")
    ? all
    : all.filter(
        (c) =>
          (c.owner_id && ids.has(c.owner_id)) ||
          (c.requested_by_id && ids.has(c.requested_by_id))
      );
  // Governance overlay: hide items above the viewer's clearance unless they
  // personally own or requested them (need-to-know still applies).
  return roleScoped.filter((c) => canAccess(viewer, c.sensitivity, c.owner_id, c.requested_by_id));
}

// --- Governance access control -------------------------------------------

/** Can this user access data at the given sensitivity? Owner/requester always can. */
export function canAccess(
  user: User,
  sensitivity: Sensitivity | undefined,
  ownerId?: string | null,
  requesterId?: string | null
): boolean {
  const s = sensitivity ?? "internal";
  if (user.id === ownerId || user.id === requesterId) return true;
  return SENSITIVITY_RANK[s] <= SENSITIVITY_RANK[clearanceFor(user.role)];
}

export interface GovernanceStats {
  total: number;
  classified: number;
  coverage: number; // 0..1 items with an explicit (non-default) classification
  byClassification: Record<Sensitivity, number>;
  untagged: Commitment[]; // sensitive items with no tags
  violations: { commitment: Commitment; issue: string }[];
}

/**
 * Governance posture across commitments: classification coverage, distribution,
 * items needing classification, and policy violations (e.g. confidential data
 * owned by an external party, or sensitive data with no tags).
 */
export function governanceStats(commitments: Commitment[]): GovernanceStats {
  const byClassification: Record<Sensitivity, number> = {
    public: 0,
    internal: 0,
    confidential: 0,
    restricted: 0,
  };
  let classified = 0;
  const untagged: Commitment[] = [];
  const violations: { commitment: Commitment; issue: string }[] = [];

  for (const c of commitments) {
    const s = c.sensitivity ?? "internal";
    byClassification[s]++;
    if (c.classified_by) classified++;
    const sensitive = SENSITIVITY_RANK[s] >= SENSITIVITY_RANK.confidential;
    if (sensitive && (!c.tag_ids || c.tag_ids.length === 0)) untagged.push(c);
    if (sensitive && c.owner_external_name && !c.owner_id) {
      violations.push({ commitment: c, issue: `${SENSITIVITY_LABEL_SHORT(s)} data owned by external party "${c.owner_external_name}"` });
    }
  }

  return {
    total: commitments.length,
    classified,
    coverage: commitments.length ? classified / commitments.length : 1,
    byClassification,
    untagged,
    violations,
  };
}

function SENSITIVITY_LABEL_SHORT(s: Sensitivity): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Derived helpers -------------------------------------------------------

export type Health = "green" | "amber" | "red" | "grey";

export function commitmentHealth(status: CommitmentStatus): Health {
  switch (status) {
    case "overdue":
    case "escalated":
      return "red";
    case "at_risk":
      return "amber";
    case "done":
      return "green";
    default:
      return "green";
  }
}

export function projectHealth(commitments: Commitment[]): Health {
  const active = commitments.filter((c) => c.status !== "done");
  if (active.length === 0) return "grey";
  if (active.some((c) => c.status === "overdue" || c.status === "escalated")) return "red";
  if (active.some((c) => c.status === "at_risk")) return "amber";
  return "green";
}

export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};
