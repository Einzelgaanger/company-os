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
  InviteSendResult,
  OrgInvite,
  DataAccessAction,
  DataAccessLogEntry,
  Escalation,
  FeedbackLabel,
  Meeting,
  Organization,
  OwnershipMapEntry,
  Project,
  DailySurveyCycle,
  DailySurveyQuestion,
  MySurveyResponse,
  ProjectMember,
  ProjectProgressSnapshot,
  ProjectPulse,
  ProjectRole,
  SurveyAggregate,
  Team,
  TeamMember,
  Report,
  Role,
  Sensitivity,
  StatusHistoryChannel,
  IngestionLabelRule,
  Tag,
  TagAudienceMode,
  User,
} from "../types";
import { DEFAULT_TAG_AUDIENCE, SENSITIVITY_RANK } from "../types";
import {
  labelIngestedItem,
  stampIngestedClassification,
  type IngestedItem,
  type LabelDecision,
} from "../ingestionPolicy";
import { isHeldMeeting } from "../meetingIngest";

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

// Tag audiences live in flat columns so Postgres RLS can evaluate them; the app
// works with the nested `audience` object.
interface TagRow extends Omit<Tag, "audience"> {
  audience_mode?: TagAudienceMode | null;
  audience_member_ids?: string[] | null;
  audience_min_role?: Role | null;
  audience_admin_override?: boolean | null;
}

function rowToTag(row: TagRow): Tag {
  return {
    ...(row as Omit<Tag, "audience">),
    audience: {
      mode: row.audience_mode ?? DEFAULT_TAG_AUDIENCE.mode,
      member_ids: row.audience_member_ids ?? [],
      min_role: row.audience_min_role ?? DEFAULT_TAG_AUDIENCE.min_role,
      admin_override: row.audience_admin_override ?? DEFAULT_TAG_AUDIENCE.admin_override,
    },
  };
}

function tagToRow(tag: Partial<Tag>): Record<string, unknown> {
  const { audience, ...rest } = tag;
  if (!audience) return rest;
  return {
    ...rest,
    audience_mode: audience.mode,
    audience_member_ids: audience.member_ids,
    audience_min_role: audience.min_role,
    audience_admin_override: audience.admin_override,
  };
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

  async inviteUser(
    actor: User,
    email: string,
    role: Role,
    managerId: string | null,
  ): Promise<InviteSendResult> {
    const { data, error } = await client().functions.invoke("invite", {
      body: { action: "send", email, role, manager_id: managerId },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    const token = String(data.token ?? "");
    const inviteUrl = String(data.invite_url ?? `${window.location.origin}/invite/${token}`);
    return {
      user: {
        id: token,
        org_id: actor.org_id,
        full_name: email.split("@")[0],
        email,
        phone_number: null,
        phone_verified_at: null,
        role,
        manager_id: managerId,
        status: "invited",
        avatar_url: null,
        notification_prefs: { whatsapp_checkins: true, preferred_channel: "in_app" },
        created_at: nowIso(),
        last_active_at: null,
      },
      invite_url: inviteUrl,
      emailed: Boolean(data.emailed),
      email_via: data.email_via ?? null,
    };
  },

  async listInvites(orgId: string): Promise<OrgInvite[]> {
    const { data, error } = await client()
      .from("invites")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OrgInvite[];
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
    const [org, rules] = await Promise.all([
      supabaseDb.getOrg(input.org_id),
      supabaseDb.listIngestionRules(input.org_id),
    ]);
    const stamped = stampIngestedClassification(
      {
        source_type: input.source_type,
        title: input.title,
        description: input.description,
        sensitivity,
        tag_ids,
      },
      rules,
      org?.settings.default_classification ?? "internal",
    );
    if (
      stamped.sensitivity !== sensitivity ||
      stamped.tag_ids.length !== (tag_ids ?? []).length ||
      stamped.matched_rule_ids.length > 0
    ) {
      classified_by = classified_by ?? "system";
    }
    sensitivity = stamped.sensitivity;
    tag_ids = stamped.tag_ids;
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
    return ((data ?? []) as Meeting[]).filter((m) => !isHeldMeeting(m));
  },

  async listHeldMeetings(orgId: string): Promise<Meeting[]> {
    const { data, error } = await client()
      .from("meetings")
      .select("*")
      .eq("org_id", orgId)
      .eq("privacy_held", true)
      .order("ingested_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Meeting[];
  },

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const { data } = await client().from("meetings").select("*").eq("id", id).maybeSingle();
    return (data as Meeting) ?? undefined;
  },

  async ingestMeeting(
    input: Omit<Meeting, "id" | "ingested_at" | "processed_at" | "extracted_commitments_count">
  ): Promise<Meeting> {
    const { data, error } = await client()
      .from("meetings")
      .insert({
        ...input,
        privacy_held: true,
        classified_by: null,
        processed_at: null,
        extracted_commitments_count: 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(data.org_id, "system", "meeting.held", "meeting", data.id, { title: data.title });
    return data as Meeting;
  },

  async releaseMeeting(
    actor: User,
    id: string,
    sensitivity: Sensitivity,
    tagIds: string[]
  ): Promise<Meeting> {
    const { data, error } = await client()
      .from("meetings")
      .update({
        sensitivity,
        tag_ids: tagIds,
        privacy_held: false,
        classified_by: "user",
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    await audit(actor.org_id, actor.id, "meeting.stored", "meeting", id, { sensitivity, tags: tagIds });
    const meeting = data as Meeting;
    if (meeting.transcript_text) {
      try {
        await client().functions.invoke("extract-commitments", {
          body: {
            org_id: meeting.org_id,
            text: meeting.transcript_text,
            source_type: "meeting",
            source_meeting_id: meeting.id,
            inherit_sensitivity: sensitivity,
            inherit_tag_ids: tagIds,
          },
        });
      } catch {
        // Extraction is best-effort; the call itself is already stored.
      }
    }
    const refreshed = await supabaseDb.getMeeting(id);
    return refreshed ?? meeting;
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
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Checkin[];
  },

  /**
   * In-app Chat reply — runs Edge classify/escalate (same as Telegram/WhatsApp).
   * Falls back to a local inbound checkin if the function is unavailable.
   */
  async sendChatMessage(
    actor: User,
    text: string,
    opts: { commitmentId?: string | null; targetUserId?: string } = {},
  ): Promise<Checkin> {
    const targetUserId = opts.targetUserId ?? actor.id;
    const { data: fnData, error: fnError } = await client().functions.invoke("chat-inbound", {
      body: {
        message_text: text,
        commitment_id: opts.commitmentId ?? null,
        target_user_id: targetUserId,
      },
    });
    if (!fnError && fnData && (fnData as { ok?: boolean }).ok !== false) {
      const rows = await supabaseDb.listCheckinsForUser(targetUserId);
      const last = [...rows].reverse().find((c) => c.direction === "inbound" && c.message_text === text);
      if (last) return last;
    }
    return supabaseDb.createInboundCheckin({
      org_id: actor.org_id,
      user_id: targetUserId,
      commitment_id: opts.commitmentId ?? null,
      direction: "inbound",
      channel: "in_app",
      message_type: "progress_ping",
      message_text: text,
      parsed_status: null,
      parsed_blocker: null,
    });
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
      title: "Company OS checked in",
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
    return (data ?? []).map(rowToTag);
  },

  async createTag(input: Omit<Tag, "id" | "created_at">): Promise<Tag> {
    const { data, error } = await client().from("tags").insert(tagToRow(input)).select("*").single();
    if (error) throw error;
    await audit(data.org_id, "system", "tag.created", "tag", data.id, {
      name: data.name,
      audience: input.audience ?? DEFAULT_TAG_AUDIENCE,
    });
    return rowToTag(data);
  },

  async updateTag(id: string, patch: Partial<Tag>, actor?: User): Promise<Tag> {
    const { data: before } = await client().from("tags").select("*").eq("id", id).maybeSingle();
    const { data, error } = await client()
      .from("tags")
      .update(tagToRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const tag = rowToTag(data);
    if (patch.audience) {
      await audit(tag.org_id, actor?.id ?? "system", "tag.audience_changed", "tag", id, {
        name: tag.name,
        from: before ? rowToTag(before).audience : null,
        to: patch.audience,
      });
    } else {
      await audit(tag.org_id, actor?.id ?? "system", "tag.updated", "tag", id, { name: tag.name });
    }
    return tag;
  },

  async deleteTag(id: string): Promise<void> {
    const { error } = await client().from("tags").delete().eq("id", id);
    if (error) throw error;
  },

  // --- Governance: ingestion labelling -------------------------------------

  async listIngestionRules(orgId: string): Promise<IngestionLabelRule[]> {
    const { data, error } = await client()
      .from("ingestion_label_rules")
      .select("*")
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as IngestionLabelRule[];
  },

  async createIngestionRule(
    actor: User,
    input: Omit<IngestionLabelRule, "id" | "created_at" | "sort_order"> & { sort_order?: number },
  ): Promise<IngestionLabelRule> {
    const { data: last } = await client()
      .from("ingestion_label_rules")
      .select("sort_order")
      .eq("org_id", input.org_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await client()
      .from("ingestion_label_rules")
      .insert({ ...input, sort_order: input.sort_order ?? ((last?.sort_order ?? 0) + 10) })
      .select("*")
      .single();
    if (error) throw error;
    await audit(data.org_id, actor.id, "ingestion_rule.created", "ingestion_label_rule", data.id, {
      name: data.name,
      sensitivity: data.sensitivity,
    });
    return data as IngestionLabelRule;
  },

  async updateIngestionRule(
    actor: User,
    id: string,
    patch: Partial<IngestionLabelRule>,
  ): Promise<IngestionLabelRule> {
    const { data, error } = await client()
      .from("ingestion_label_rules")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    await audit(data.org_id, actor.id, "ingestion_rule.updated", "ingestion_label_rule", id, {
      name: data.name,
    });
    return data as IngestionLabelRule;
  },

  async deleteIngestionRule(actor: User, id: string): Promise<void> {
    const { data: rule } = await client()
      .from("ingestion_label_rules")
      .select("org_id,name")
      .eq("id", id)
      .maybeSingle();
    const { error } = await client().from("ingestion_label_rules").delete().eq("id", id);
    if (error) throw error;
    if (rule) {
      await audit(rule.org_id, actor.id, "ingestion_rule.deleted", "ingestion_label_rule", id, {
        name: rule.name,
      });
    }
  },

  async previewIngestionLabel(orgId: string, item: IngestedItem): Promise<LabelDecision> {
    const [org, rules] = await Promise.all([
      supabaseDb.getOrg(orgId),
      supabaseDb.listIngestionRules(orgId),
    ]);
    return labelIngestedItem(item, rules, org?.settings.default_classification ?? "internal");
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

  // --- Teams (0013) ---------------------------------------------------------

  async listTeams(orgId: string): Promise<Team[]> {
    const { data, error } = await client()
      .from("teams")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Team[];
  },

  async createTeam(input: {
    org_id: string;
    name: string;
    description?: string | null;
    lead_user_id?: string | null;
    created_by_id?: string | null;
  }): Promise<Team> {
    const { data, error } = await client().from("teams").insert(input).select("*").single();
    if (error) throw error;
    // The lead is a member by definition; a team whose lead is not in it makes
    // every downstream membership query wrong.
    if (input.lead_user_id) {
      await client().from("team_members").upsert({
        org_id: input.org_id,
        team_id: data.id,
        user_id: input.lead_user_id,
        role_in_team: "lead",
      });
    }
    await audit(input.org_id, input.created_by_id ?? "system", "team.created", "team", data.id);
    return data as Team;
  },

  async updateTeam(id: string, patch: Partial<Team>): Promise<Team> {
    const { data, error } = await client().from("teams").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as Team;
  },

  async deleteTeam(id: string): Promise<void> {
    const { error } = await client().from("teams").delete().eq("id", id);
    if (error) throw error;
  },

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { data, error } = await client().from("team_members").select("*").eq("team_id", teamId);
    if (error) throw error;
    return (data ?? []) as TeamMember[];
  },

  async listAllTeamMembers(orgId: string): Promise<TeamMember[]> {
    const { data, error } = await client().from("team_members").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as TeamMember[];
  },

  async addTeamMember(input: {
    org_id: string;
    team_id: string;
    user_id: string;
    role_in_team?: "lead" | "member";
  }): Promise<void> {
    const { error } = await client()
      .from("team_members")
      .upsert({ role_in_team: "member", ...input });
    if (error) throw error;
  },

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    const { error } = await client()
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  // --- Project membership ---------------------------------------------------

  async listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await client()
      .from("project_members")
      .select("*")
      .eq("project_id", projectId);
    if (error) throw error;
    return (data ?? []) as ProjectMember[];
  },

  async listAllProjectMembers(orgId: string): Promise<ProjectMember[]> {
    const { data, error } = await client().from("project_members").select("*").eq("org_id", orgId);
    if (error) throw error;
    return (data ?? []) as ProjectMember[];
  },

  async addProjectMember(input: {
    org_id: string;
    project_id: string;
    user_id: string;
    role_in_project?: ProjectRole;
    allocation_pct?: number;
  }): Promise<void> {
    const { error } = await client()
      .from("project_members")
      .upsert({ role_in_project: "contributor", allocation_pct: 100, ...input });
    if (error) throw error;
  },

  async updateProjectMember(
    projectId: string,
    userId: string,
    patch: Partial<Pick<ProjectMember, "role_in_project" | "allocation_pct">>,
  ): Promise<void> {
    const { error } = await client()
      .from("project_members")
      .update(patch)
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    const { error } = await client()
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  // --- Project progress -----------------------------------------------------

  /** Latest nightly snapshot. Null before project-progress has run once. */
  async getProjectProgress(projectId: string): Promise<ProjectProgressSnapshot | undefined> {
    const { data } = await client()
      .from("project_progress_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as ProjectProgressSnapshot) ?? undefined;
  },

  /** Trailing history, for the progress trend line. */
  async listProjectProgressHistory(projectId: string, days = 30): Promise<ProjectProgressSnapshot[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await client()
      .from("project_progress_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .gte("as_of", since)
      .order("as_of");
    if (error) throw error;
    return (data ?? []) as ProjectProgressSnapshot[];
  },

  async listProjectPulses(projectId: string, days = 14): Promise<ProjectPulse[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await client()
      .from("project_pulses")
      .select("*")
      .eq("project_id", projectId)
      .gte("asked_at", since)
      .order("asked_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProjectPulse[];
  },

  // --- Daily surveys (0012) -------------------------------------------------

  /**
   * The live cycle this person was actually invited to. Scope is resolved
   * server-side, so the client finds it through its own delivery row rather
   * than trying to work out which project or department it belongs to.
   */
  async getMyLiveSurvey(userId: string): Promise<DailySurveyCycle | undefined> {
    const { data: deliveries } = await client()
      .from("survey_deliveries")
      .select("cycle_id")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(10);

    const ids = (deliveries ?? []).map((d: { cycle_id: string }) => d.cycle_id);
    if (!ids.length) return undefined;

    const { data: cycle } = await client()
      .from("survey_cycles")
      .select("*")
      .in("id", ids)
      .eq("status", "live")
      .order("survey_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cycle) return undefined;

    const { data: questions } = await client()
      .from("survey_questions")
      .select("*")
      .eq("cycle_id", cycle.id)
      .order("sort_order");

    return {
      ...(cycle as DailySurveyCycle),
      questions: ((questions ?? []) as DailySurveyQuestion[]).filter((q) => q.approved !== false),
    };
  },

  /** userId is accepted for parity with the mock plane; here it comes from auth. */
  async hasRespondedToSurvey(cycleId: string, _userId?: string): Promise<boolean> {
    const { data, error } = await client().rpc("survey_has_responded", { p_cycle: cycleId });
    if (error) throw error;
    return Boolean(data);
  },

  /** Answers are {question_id: text}. Blank entries are skipped server-side. */
  async submitDailySurvey(
    cycleId: string,
    answers: Record<string, string>,
    _userId?: string,
  ): Promise<number> {
    const { data, error } = await client().rpc("submit_survey_response", {
      p_cycle: cycleId,
      p_answers: answers,
    });
    if (error) throw error;
    return Number(data ?? 0);
  },

  async listDailySurveyCycles(orgId: string, days = 30): Promise<DailySurveyCycle[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await client()
      .from("survey_cycles")
      .select("*")
      .eq("org_id", orgId)
      .gte("survey_date", since)
      .order("survey_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as DailySurveyCycle[];
  },

  async getSurveyCycleQuestions(cycleId: string): Promise<DailySurveyQuestion[]> {
    const { data, error } = await client()
      .from("survey_questions")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as DailySurveyQuestion[];
  },

  async reviewDailySurveyQuestion(
    questionId: string,
    approved: boolean,
    actorId?: string,
  ): Promise<void> {
    const { error } = await client()
      .from("survey_questions")
      .update({ approved, approved_by_user_id: actorId ?? null, approved_at: nowIso() })
      .eq("id", questionId);
    if (error) throw error;
  },

  /**
   * Releases a reviewed cycle. send-survey picks it up on the next hourly pass
   * and delivers it to everyone in scope at their local send hour.
   */
  async publishDailySurveyCycle(cycleId: string): Promise<void> {
    const { error } = await client()
      .from("survey_cycles")
      .update({ status: "live", opened_at: nowIso() })
      .eq("id", cycleId);
    if (error) throw error;
  },

  /**
   * Aggregated results only. RLS restricts this to manager+ and the database
   * CHECK guarantees every row represents at least five respondents.
   */
  async listSurveyAggregates(orgId: string, weeks = 8): Promise<SurveyAggregate[]> {
    const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await client()
      .from("survey_aggregates")
      .select("*")
      .eq("org_id", orgId)
      .gte("period_end", since)
      .order("period_end", { ascending: false });
    if (error) throw error;
    return (data ?? []) as SurveyAggregate[];
  },

  /** Transparency page: a person reads back their own answers, verbatim. */
  async listMySurveyResponses(_userId?: string): Promise<MySurveyResponse[]> {
    const { data, error } = await client().rpc("my_survey_responses");
    if (error) throw error;
    return (data ?? []) as MySurveyResponse[];
  },

  async deleteMySurveyResponses(cycleId: string, _userId?: string): Promise<number> {
    const { data, error } = await client().rpc("delete_my_survey_responses", { p_cycle: cycleId });
    if (error) throw error;
    return Number(data ?? 0);
  },

  // --- Email preferences (0014) ---------------------------------------------

  async updateEmailPrefs(userId: string, prefs: Record<string, boolean>): Promise<void> {
    const { error } = await client().from("users").update({ email_prefs: prefs }).eq("id", userId);
    if (error) throw error;
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
