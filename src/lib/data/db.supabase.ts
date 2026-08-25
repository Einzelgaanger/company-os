import { supabase } from "../supabase";
import { nowIso, uuid } from "../utils";
import { classify } from "../classify";
import type {
  AppNotification,
  AuditLogEntry,
  Checkin,
  Commitment,
  CommitmentDependency,
  CommitmentFeedback,
  CommitmentStatusHistory,
  Connection,
  ConnectionProvider,
  DataAccessAction,
  DataAccessLogEntry,
  Escalation,
  FeedbackLabel,
  Meeting,
  Organization,
  OwnershipMapEntry,
  Project,
  Report,
  Role,
  Sensitivity,
  StatusHistoryChannel,
  Tag,
  User,
} from "../types";
import { SENSITIVITY_RANK } from "../types";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function audit(
  orgId: string,
  actor: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await client().from("audit_log").insert({
    org_id: orgId,
    actor,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}

async function notify(n: Omit<AppNotification, "id" | "created_at" | "read_at">) {
  await client().from("notifications").insert({
    org_id: n.org_id,
    user_id: n.user_id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
  });
}

function one<T>(data: T | T[] | null): T | undefined {
  if (!data) return undefined;
  return Array.isArray(data) ? data[0] : data;
}

export const supabaseDb = {
  async getOrg(orgId: string): Promise<Organization | undefined> {
    const { data } = await client().from("organizations").select("*").eq("id", orgId).maybeSingle();
    return (data as Organization) ?? undefined;
  },

  async updateOrg(orgId: string, patch: Partial<Organization>): Promise<Organization> {
    const current = await supabaseDb.getOrg(orgId);
    if (!current) throw new Error("Organization not found");
    const next = {
      ...patch,
      settings: { ...current.settings, ...patch.settings },
    };
    const { data, error } = await client()
      .from("organizations")
      .update(next)
      .eq("id", orgId)
      .select("*")
      .single();
    if (error) throw error;
    await audit(orgId, "system", "organization.updated", "organization", orgId);
    return data as Organization;
  },

  async getUser(userId: string): Promise<User | undefined> {
    const { data } = await client().from("users").select("*").eq("id", userId).maybeSingle();
    return (data as User) ?? undefined;
  },

  async listUsers(orgId: string): Promise<User[]> {
    const { data, error } = await client().from("users").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as User[];
  },

  async updateUser(userId: string, patch: Partial<User>): Promise<User> {
    const { data, error } = await client().from("users").update(patch).eq("id", userId).select("*").single();
    if (error) throw error;
    return data as User;
  },

  async changeRole(actor: User, userId: string, role: Role): Promise<User> {
    const user = await supabaseDb.updateUser(userId, { role });
    await audit(actor.org_id, actor.id, "role.changed", "user", userId, { role });
    return user;
  },

  async setManager(userId: string, managerId: string | null): Promise<User> {
    return supabaseDb.updateUser(userId, { manager_id: managerId });
  },

  async inviteUser(actor: User, email: string, role: Role, managerId: string | null): Promise<User> {
    const { data: inv, error } = await client()
      .from("invites")
      .insert({
        org_id: actor.org_id,
        email: email.toLowerCase(),
        role,
        manager_id: managerId,
        created_by: actor.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(actor.org_id, actor.id, "user.invited", "invite", inv.token, { email, role });
    // Placeholder row shape for the UI; real users row is created on accept.
    return {
      id: inv.token,
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
      created_at: inv.created_at,
      last_active_at: null,
    };
  },

  async bootstrapOrganization(name: string, fullName?: string): Promise<string> {
    const { data, error } = await client().rpc("bootstrap_organization", {
      p_name: name,
      p_full_name: fullName ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async acceptInvite(token: string, fullName?: string): Promise<string> {
    const { data, error } = await client().rpc("accept_invite", {
      p_token: token,
      p_full_name: fullName ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async listProjects(orgId: string): Promise<Project[]> {
    const { data, error } = await client().from("projects").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Project[];
  },

  async getProject(id: string): Promise<Project | undefined> {
    const { data } = await client().from("projects").select("*").eq("id", id).maybeSingle();
    return (data as Project) ?? undefined;
  },

  async createProject(input: Omit<Project, "id" | "created_at">): Promise<Project> {
    const { data, error } = await client().from("projects").insert(input).select("*").single();
    if (error) throw error;
    await audit(data.org_id, data.owner_id ?? "system", "project.created", "project", data.id);
    return data as Project;
  },

  async updateProject(id: string, patch: Partial<Project>): Promise<Project> {
    const { data, error } = await client().from("projects").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as Project;
  },

  async listCommitments(orgId: string): Promise<Commitment[]> {
    const { data, error } = await client().from("commitments").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Commitment[];
  },

  async getCommitment(id: string): Promise<Commitment | undefined> {
    const { data } = await client().from("commitments").select("*").eq("id", id).maybeSingle();
    return (data as Commitment) ?? undefined;
  },

  async createCommitment(
    input: Omit<Commitment, "id" | "created_at" | "updated_at" | "resolved_at" | "last_checkin_at">
  ): Promise<Commitment> {
    let { sensitivity, tag_ids, classified_by } = input;
    if (!sensitivity) {
      const guess = classify(input.title, input.description);
      const tags = await supabaseDb.listTags(input.org_id);
      const byName = new Map(tags.map((t) => [t.name, t.id]));
      sensitivity = guess.sensitivity;
      tag_ids = guess.tags.map((n) => byName.get(n)).filter(Boolean) as string[];
      classified_by = "system";
    }
    const { data, error } = await client()
      .from("commitments")
      .insert({
        ...input,
        sensitivity,
        tag_ids: tag_ids ?? [],
        classified_by: classified_by ?? null,
        confidence_score: input.confidence_score ?? null,
        needs_review: input.needs_review ?? false,
        source_quote: input.source_quote ?? null,
        snoozed_until: input.snoozed_until ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(data.org_id, data.requested_by_id ?? "system", "commitment.created", "commitment", data.id);
    await supabaseDb.appendStatusHistory(
      data.org_id,
      data.id,
      null,
      data.status,
      "ui",
      data.requested_by_id,
      "Created"
    );
    return data as Commitment;
  },

  async updateCommitment(id: string, patch: Partial<Commitment>): Promise<Commitment> {
    const prev = await supabaseDb.getCommitment(id);
    const { data, error } = await client()
      .from("commitments")
      .update({ ...patch, updated_at: nowIso() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    if (prev && patch.status && patch.status !== prev.status) {
      await supabaseDb.appendStatusHistory(data.org_id, id, prev.status, patch.status, "ui", null, null);
    }
    return data as Commitment;
  },

  async markCommitmentDone(actor: User, id: string): Promise<Commitment> {
    const c = await supabaseDb.updateCommitment(id, {
      status: "done",
      resolved_at: nowIso(),
      needs_review: false,
    });
    await audit(actor.org_id, actor.id, "commitment.done", "commitment", id);
    return c;
  },

  async listReviewQueue(orgId: string): Promise<Commitment[]> {
    const { data, error } = await client()
      .from("commitments")
      .select("*")
      .eq("org_id", orgId)
      .eq("needs_review", true)
      .neq("status", "done")
      .order("confidence_score", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Commitment[];
  },

  async approveReview(actor: User, id: string): Promise<Commitment> {
    const c = await supabaseDb.updateCommitment(id, { needs_review: false });
    await supabaseDb.appendStatusHistory(actor.org_id, id, c.status, c.status, "ui", actor.id, "Approved from review queue");
    await audit(actor.org_id, actor.id, "commitment.review_approved", "commitment", id);
    return c;
  },

  async rejectReview(actor: User, id: string): Promise<Commitment> {
    const prev = await supabaseDb.getCommitment(id);
    const c = await supabaseDb.updateCommitment(id, {
      needs_review: false,
      status: "done",
      resolved_at: nowIso(),
    });
    if (prev) {
      await supabaseDb.appendStatusHistory(actor.org_id, id, prev.status, "done", "ui", actor.id, "Rejected from review queue");
    }
    await audit(actor.org_id, actor.id, "commitment.review_rejected", "commitment", id);
    return c;
  },

  async listDependencies(commitmentId: string): Promise<CommitmentDependency[]> {
    const { data, error } = await client()
      .from("commitment_dependencies")
      .select("*")
      .eq("commitment_id", commitmentId);
    if (error) throw error;
    return (data ?? []) as CommitmentDependency[];
  },

  async addDependency(orgId: string, commitmentId: string, blockedById: string): Promise<CommitmentDependency> {
    if (commitmentId === blockedById) throw new Error("A commitment cannot block itself.");
    const { data, error } = await client()
      .from("commitment_dependencies")
      .upsert(
        { org_id: orgId, commitment_id: commitmentId, blocked_by_id: blockedById },
        { onConflict: "commitment_id,blocked_by_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data as CommitmentDependency;
  },

  async removeDependency(id: string): Promise<void> {
    const { error } = await client().from("commitment_dependencies").delete().eq("id", id);
    if (error) throw error;
  },

  async submitFeedback(
    actor: User,
    commitmentId: string,
    label: FeedbackLabel,
    errorCategory?: string | null,
    note?: string | null
  ): Promise<CommitmentFeedback> {
    const { data, error } = await client()
      .from("commitment_feedback")
      .insert({
        org_id: actor.org_id,
        commitment_id: commitmentId,
        actor_id: actor.id,
        label,
        error_category: errorCategory ?? null,
        note: note ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(actor.org_id, actor.id, "commitment.feedback", "commitment", commitmentId, {
      label,
      errorCategory,
    });
    return data as CommitmentFeedback;
  },

  async listFeedback(commitmentId: string): Promise<CommitmentFeedback[]> {
    const { data, error } = await client()
      .from("commitment_feedback")
      .select("*")
      .eq("commitment_id", commitmentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CommitmentFeedback[];
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
    const { data, error } = await client()
      .from("commitment_status_history")
      .insert({
        org_id: orgId,
        commitment_id: commitmentId,
        from_status: fromStatus,
        to_status: toStatus,
        channel,
        actor_id: actorId,
        note,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as CommitmentStatusHistory;
  },

  async listStatusHistory(commitmentId: string): Promise<CommitmentStatusHistory[]> {
    const { data, error } = await client()
      .from("commitment_status_history")
      .select("*")
      .eq("commitment_id", commitmentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CommitmentStatusHistory[];
  },

  async listMeetings(orgId: string): Promise<Meeting[]> {
    const { data, error } = await client().from("meetings").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Meeting[];
  },

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const { data } = await client().from("meetings").select("*").eq("id", id).maybeSingle();
    return (data as Meeting) ?? undefined;
  },

  async listCheckins(orgId: string): Promise<Checkin[]> {
    const { data, error } = await client().from("checkins").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Checkin[];
  },

  async listCheckinsForCommitment(commitmentId: string): Promise<Checkin[]> {
    const { data, error } = await client()
      .from("checkins")
      .select("*")
      .eq("commitment_id", commitmentId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Checkin[];
  },

  async listCheckinsForUser(userId: string): Promise<Checkin[]> {
    const { data, error } = await client()
      .from("checkins")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Checkin[];
  },

  async sendCheckin(actor: User, targetUserId: string, commitmentId: string | null, text: string) {
    // Prefer edge function (handles Twilio + in-app fallback).
    const { data: fnData, error: fnError } = await client().functions.invoke("send-checkin", {
      body: { user_id: targetUserId, commitment_id: commitmentId, text },
    });
    if (!fnError && fnData) {
      const rows = await supabaseDb.listCheckinsForUser(targetUserId);
      return rows[0];
    }
    // Client fallback (manager outbound policy).
    const { data, error } = await client()
      .from("checkins")
      .insert({
        org_id: actor.org_id,
        user_id: targetUserId,
        commitment_id: commitmentId,
        direction: "outbound",
        channel: "in_app",
        message_type: commitmentId ? "direct_followup" : "progress_ping",
        message_text: text,
        twilio_sid: `INAPP-${uuid().slice(0, 8)}`,
      })
      .select("*")
      .single();
    if (error) throw error;
    if (commitmentId) await supabaseDb.updateCommitment(commitmentId, { last_checkin_at: nowIso() });
    await notify({
      org_id: actor.org_id,
      user_id: targetUserId,
      kind: "system",
      title: "Loop checked in",
      body: text,
      link: "/my-work",
    });
    await audit(actor.org_id, actor.id, "checkin.sent", "checkin", data.id, { targetUserId });
    return data as Checkin;
  },

  async createInboundCheckin(input: Omit<Checkin, "id" | "created_at" | "twilio_sid">): Promise<Checkin> {
    const { data, error } = await client()
      .from("checkins")
      .insert({ ...input, twilio_sid: null })
      .select("*")
      .single();
    if (error) throw error;
    return data as Checkin;
  },

  async listEscalations(orgId: string): Promise<Escalation[]> {
    const { data, error } = await client().from("escalations").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Escalation[];
  },

  async getEscalation(id: string): Promise<Escalation | undefined> {
    const { data } = await client().from("escalations").select("*").eq("id", id).maybeSingle();
    return (data as Escalation) ?? undefined;
  },

  async acknowledgeEscalation(actor: User, id: string): Promise<Escalation> {
    const { data, error } = await client()
      .from("escalations")
      .update({ status: "acknowledged", acknowledged_at: nowIso() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const commitment = await supabaseDb.getCommitment(data.commitment_id);
    if (commitment?.requested_by_id) {
      await notify({
        org_id: actor.org_id,
        user_id: commitment.requested_by_id,
        kind: "escalation",
        title: "Someone's on it",
        body: `${actor.full_name} acknowledged the escalation for "${commitment.title}".`,
        link: `/escalations/${id}`,
      });
    }
    await audit(actor.org_id, actor.id, "escalation.acknowledged", "escalation", id);
    return data as Escalation;
  },

  async resolveEscalation(actor: User, id: string, note: string): Promise<Escalation> {
    const { data, error } = await client()
      .from("escalations")
      .update({ status: "resolved", resolved_at: nowIso() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    await supabaseDb.updateCommitment(data.commitment_id, { status: "in_progress" });
    const commitment = await supabaseDb.getCommitment(data.commitment_id);
    if (commitment?.requested_by_id) {
      await notify({
        org_id: actor.org_id,
        user_id: commitment.requested_by_id,
        kind: "escalation",
        title: "Escalation resolved",
        body: `${commitment.title}: ${note}`,
        link: `/commitments/${data.commitment_id}`,
      });
    }
    await audit(actor.org_id, actor.id, "escalation.resolved", "escalation", id, { note });
    return data as Escalation;
  },

  async listOwnershipMap(orgId: string): Promise<OwnershipMapEntry[]> {
    const { data, error } = await client().from("ownership_map").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as OwnershipMapEntry[];
  },

  async upsertOwnershipEntry(entry: OwnershipMapEntry): Promise<OwnershipMapEntry> {
    const { data, error } = await client()
      .from("ownership_map")
      .upsert(entry)
      .select("*")
      .single();
    if (error) throw error;
    await audit(entry.org_id, "system", "ownership_map.updated", "ownership_map", entry.id);
    return data as OwnershipMapEntry;
  },

  async removeOwnershipEntry(id: string): Promise<void> {
    const { error } = await client().from("ownership_map").delete().eq("id", id);
    if (error) throw error;
  },

  async listReports(orgId: string): Promise<Report[]> {
    const { data, error } = await client().from("reports").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Report[];
  },

  async getReport(id: string): Promise<Report | undefined> {
    const { data } = await client().from("reports").select("*").eq("id", id).maybeSingle();
    return (data as Report) ?? undefined;
  },

  async listConnections(orgId: string): Promise<Connection[]> {
    const { data, error } = await client()
      .from("connections")
      .select(
        "id, org_id, user_id, provider, status, scopes, external_account_email, connected_at, last_synced_at, error_message"
      )
      .eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Connection[];
  },

  async connectProvider(
    orgId: string,
    userId: string | null,
    provider: ConnectionProvider,
    email: string
  ): Promise<Connection> {
    const { data: existing } = await client()
      .from("connections")
      .select("id")
      .eq("org_id", orgId)
      .eq("provider", provider)
      .maybeSingle();
    const row = {
      org_id: orgId,
      user_id: userId,
      provider,
      status: "connected" as const,
      scopes: [] as string[],
      external_account_email: email,
      connected_at: nowIso(),
      last_synced_at: nowIso(),
      error_message: null,
    };
    const q = existing
      ? client().from("connections").update(row).eq("id", existing.id)
      : client().from("connections").insert(row);
    const { data, error } = await q.select("*").single();
    if (error) throw error;
    await audit(orgId, userId ?? "system", "connection.connected", "connection", data.id, { provider });
    return data as Connection;
  },

  async disconnectProvider(orgId: string, id: string): Promise<void> {
    const { error } = await client()
      .from("connections")
      .update({ status: "disconnected" })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) throw error;
    await audit(orgId, "system", "connection.revoked", "connection", id);
  },

  async listNotifications(userId: string): Promise<AppNotification[]> {
    const { data, error } = await client()
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  },

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await client().from("notifications").update({ read_at: nowIso() }).eq("id", id);
    if (error) throw error;
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    const { error } = await client()
      .from("notifications")
      .update({ read_at: nowIso() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw error;
  },

  async listAuditLog(orgId: string): Promise<AuditLogEntry[]> {
    const { data, error } = await client()
      .from("audit_log")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as AuditLogEntry[];
  },

  async listTags(orgId: string): Promise<Tag[]> {
    const { data, error } = await client().from("tags").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as Tag[];
  },

  async createTag(input: Omit<Tag, "id" | "created_at">): Promise<Tag> {
    const { data, error } = await client().from("tags").insert(input).select("*").single();
    if (error) throw error;
    await audit(data.org_id, "system", "tag.created", "tag", data.id, { name: data.name });
    return data as Tag;
  },

  async updateTag(id: string, patch: Partial<Tag>): Promise<Tag> {
    const { data, error } = await client().from("tags").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as Tag;
  },

  async deleteTag(id: string): Promise<void> {
    const { error } = await client().from("tags").delete().eq("id", id);
    if (error) throw error;
  },

  async classifyCommitment(
    actor: User,
    id: string,
    sensitivity: Sensitivity,
    tagIds: string[]
  ): Promise<Commitment> {
    const c = await supabaseDb.updateCommitment(id, {
      sensitivity,
      tag_ids: tagIds,
      classified_by: "user",
    });
    await supabaseDb.logDataAccess(actor, "commitment", id, sensitivity, "reclassify");
    await audit(actor.org_id, actor.id, "data.reclassified", "commitment", id, { sensitivity, tags: tagIds });
    return c;
  },

  async classifyMeeting(actor: User, id: string, sensitivity: Sensitivity, tagIds: string[]): Promise<void> {
    const { error } = await client()
      .from("meetings")
      .update({ sensitivity, tag_ids: tagIds })
      .eq("id", id);
    if (error) throw error;
    await audit(actor.org_id, actor.id, "data.reclassified", "meeting", id, { sensitivity, tags: tagIds });
  },

  async logDataAccess(
    actor: User,
    entityType: DataAccessLogEntry["entity_type"],
    entityId: string,
    sensitivity: Sensitivity,
    action: DataAccessAction
  ): Promise<void> {
    if (SENSITIVITY_RANK[sensitivity] < SENSITIVITY_RANK.confidential && action === "view") return;
    const { error } = await client().from("data_access_log").insert({
      org_id: actor.org_id,
      actor_id: actor.id,
      entity_type: entityType,
      entity_id: entityId,
      sensitivity,
      action,
    });
    if (error) throw error;
  },

  async listDataAccessLog(orgId: string): Promise<DataAccessLogEntry[]> {
    const { data, error } = await client()
      .from("data_access_log")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as DataAccessLogEntry[];
  },

  async invokeAutonomySweep(): Promise<{ checkins: number; escalations: number }> {
    const [checkinRes, spRes] = await Promise.all([
      client().functions.invoke("send-checkin", { body: {} }),
      client().functions.invoke("escalate", { body: {} }),
    ]);
    const checkins = (checkinRes.data as { sent?: number } | null)?.sent ?? 0;
    const escalations = (spRes.data as { swept?: number } | null)?.swept ?? 0;
    return { checkins, escalations };
  },
};

// silence unused helper warning in some TS configs
void one;
