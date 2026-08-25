/**
 * Postgres helpers for remaining CRUD domains (connections, projects, reports,
 * holidays, exclusions, invites, DSR, review). Used when storeMode === "postgres".
 */
import { withTenantContext, schema } from "@loop/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

const {
  projects,
  connections,
  reports,
  tenantHolidays,
  ingestionExclusions,
  invites,
  dsrRequests,
  commitments,
  surveyCycles,
  surveyQuestions,
  surveyResponses,
  milestones,
  flowEvents,
  tenantFlags,
} = schema;

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

// ── Projects ───────────────────────────────────────────────────────────────

export async function pgListProjects(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), isNull(projects.deletedAt)));
    return rows.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      name: p.name,
      costOfDelayBand: p.costOfDelayBand,
      status: p.status,
    }));
  });
}

export async function pgEnsurePilotProjects(tenantId: string): Promise<void> {
  await withTenantContext(tenantId, async (db) => {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.tenantId, tenantId))
      .limit(1);
    if (existing.length > 0) return;
    await db.insert(projects).values([
      {
        tenantId,
        name: "Northgate migration",
        costOfDelayBand: "high",
        status: "active",
      },
      {
        tenantId,
        name: "Loop pilot",
        costOfDelayBand: "standard",
        status: "active",
      },
    ]);
  });
}

// ── Connections ────────────────────────────────────────────────────────────

export async function pgListConnections(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(connections)
      .where(eq(connections.tenantId, tenantId));
    return rows.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      userId: c.userId,
      provider: c.provider,
      status: c.status as "connected" | "error" | "expired" | "disconnected",
      lastSyncedAt: iso(c.lastSyncedAt),
      externalAccountEmail: c.externalAccount,
      scopes: c.scopes ?? [],
    }));
  });
}

export async function pgUpsertConnection(input: {
  tenantId: string;
  userId: string | null;
  provider: string;
  status: "connected" | "error" | "expired" | "disconnected";
  externalAccountEmail: string | null;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string[];
}) {
  return withTenantContext(input.tenantId, async (db) => {
    const existing = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.tenantId, input.tenantId),
          eq(connections.provider, input.provider),
        ),
      );
    const match = existing.find((c) => (c.userId ?? null) === (input.userId ?? null));
    const encAccess = input.accessTokenEnc
      ? Buffer.from(input.accessTokenEnc, "utf8")
      : null;
    const encRefresh = input.refreshTokenEnc
      ? Buffer.from(input.refreshTokenEnc, "utf8")
      : null;
    if (match) {
      const [row] = await db
        .update(connections)
        .set({
          status: input.status,
          externalAccount: input.externalAccountEmail,
          accessTokenEnc: encAccess ?? match.accessTokenEnc,
          refreshTokenEnc: encRefresh ?? match.refreshTokenEnc,
          tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null,
          scopes: input.scopes ?? match.scopes,
          connectedAt: input.status === "connected" ? new Date() : match.connectedAt,
          lastSyncedAt: new Date(),
        })
        .where(eq(connections.id, match.id))
        .returning();
      return {
        id: row!.id,
        tenantId: row!.tenantId,
        userId: row!.userId,
        provider: row!.provider,
        status: row!.status as "connected" | "error" | "expired" | "disconnected",
        lastSyncedAt: iso(row!.lastSyncedAt),
        externalAccountEmail: row!.externalAccount,
        scopes: row!.scopes ?? [],
      };
    }
    const [row] = await db
      .insert(connections)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        provider: input.provider,
        status: input.status,
        externalAccount: input.externalAccountEmail,
        accessTokenEnc: encAccess,
        refreshTokenEnc: encRefresh,
        tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null,
        scopes: input.scopes ?? [],
        connectedAt: input.status === "connected" ? new Date() : null,
        lastSyncedAt: new Date(),
      })
      .returning();
    return {
      id: row!.id,
      tenantId: row!.tenantId,
      userId: row!.userId,
      provider: row!.provider,
      status: row!.status as "connected" | "error" | "expired" | "disconnected",
      lastSyncedAt: iso(row!.lastSyncedAt),
      externalAccountEmail: row!.externalAccount,
      scopes: row!.scopes ?? [],
    };
  });
}

export async function pgDisconnectConnection(tenantId: string, id: string): Promise<boolean> {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .update(connections)
      .set({
        status: "disconnected",
        accessTokenEnc: null,
        refreshTokenEnc: null,
      })
      .where(and(eq(connections.id, id), eq(connections.tenantId, tenantId)))
      .returning();
    return Boolean(row);
  });
}

// ── Reports ────────────────────────────────────────────────────────────────

export async function pgListReports(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.tenantId, tenantId))
      .orderBy(desc(reports.createdAt));
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      type: r.type as "weekly" | "daily",
      periodStart: String(r.periodStart),
      periodEnd: String(r.periodEnd),
      contentMd:
        typeof (r.contentJson as { md?: string } | null)?.md === "string"
          ? (r.contentJson as { md: string }).md
          : JSON.stringify(r.contentJson ?? {}),
      contentHtml: r.contentHtml,
      pdfRef: r.pdfRef,
      pdfSha256: r.pdfSha256,
      status: r.status as "generating" | "ready" | "failed",
      createdAt: iso(r.createdAt)!,
    }));
  });
}

export async function pgGetReport(tenantId: string, id: string) {
  return withTenantContext(tenantId, async (db) => {
    const [r] = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, id), eq(reports.tenantId, tenantId)))
      .limit(1);
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenantId,
      type: r.type as "weekly" | "daily",
      periodStart: String(r.periodStart),
      periodEnd: String(r.periodEnd),
      contentMd:
        typeof (r.contentJson as { md?: string } | null)?.md === "string"
          ? (r.contentJson as { md: string }).md
          : JSON.stringify(r.contentJson ?? {}),
      contentHtml: r.contentHtml,
      pdfRef: r.pdfRef,
      pdfSha256: r.pdfSha256,
      status: r.status as "generating" | "ready" | "failed",
      createdAt: iso(r.createdAt)!,
    };
  });
}

export async function pgSaveReport(row: {
  id: string;
  tenantId: string;
  type: "weekly" | "daily";
  periodStart: string;
  periodEnd: string;
  contentMd: string;
  contentHtml: string | null;
  pdfRef: string | null;
  pdfSha256: string | null;
  status: "generating" | "ready" | "failed";
  createdAt: string;
}) {
  return withTenantContext(row.tenantId, async (db) => {
    const existing = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.id, row.id), eq(reports.tenantId, row.tenantId)))
      .limit(1);
    const contentJson = { md: row.contentMd };
    const status =
      row.status === "failed"
        ? ("failed" as const)
        : row.status === "ready"
          ? ("ready" as const)
          : ("generating" as const);
    if (existing.length) {
      await db
        .update(reports)
        .set({
          contentJson,
          contentHtml: row.contentHtml,
          pdfRef: row.pdfRef,
          pdfSha256: row.pdfSha256,
          status,
          generatedAt: row.status === "ready" ? new Date() : null,
        })
        .where(eq(reports.id, row.id));
    } else {
      await db.insert(reports).values({
        id: row.id,
        tenantId: row.tenantId,
        type: row.type,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        contentJson,
        contentHtml: row.contentHtml,
        pdfRef: row.pdfRef,
        pdfSha256: row.pdfSha256,
        status,
        generatedAt: row.status === "ready" ? new Date() : null,
      });
    }
    return row;
  });
}

// ── Holidays ───────────────────────────────────────────────────────────────

export async function pgListHolidays(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(tenantHolidays)
      .where(eq(tenantHolidays.tenantId, tenantId));
    return rows
      .map((h) => ({
        id: `${h.holidayDate}`,
        tenantId: h.tenantId,
        date: String(h.holidayDate),
        name: h.name,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });
}

export async function pgAddHoliday(input: {
  tenantId: string;
  date: string;
  name: string;
}) {
  return withTenantContext(input.tenantId, async (db) => {
    await db
      .insert(tenantHolidays)
      .values({
        tenantId: input.tenantId,
        holidayDate: input.date,
        name: input.name,
      })
      .onConflictDoUpdate({
        target: [tenantHolidays.tenantId, tenantHolidays.holidayDate],
        set: { name: input.name },
      });
    return {
      id: input.date,
      tenantId: input.tenantId,
      date: input.date,
      name: input.name,
    };
  });
}

export async function pgDeleteHoliday(tenantId: string, idOrDate: string): Promise<boolean> {
  return withTenantContext(tenantId, async (db) => {
    const date = idOrDate.includes("T") ? idOrDate.slice(0, 10) : idOrDate;
    const deleted = await db
      .delete(tenantHolidays)
      .where(
        and(
          eq(tenantHolidays.tenantId, tenantId),
          eq(tenantHolidays.holidayDate, date),
        ),
      )
      .returning();
    return deleted.length > 0;
  });
}

// ── Exclusions ─────────────────────────────────────────────────────────────

export async function pgListExclusions(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(ingestionExclusions)
      .where(eq(ingestionExclusions.tenantId, tenantId));
    return rows.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      scope: (["user", "meeting", "keyword", "domain"].includes(e.ruleType)
        ? e.ruleType
        : "keyword") as "user" | "meeting" | "keyword" | "domain",
      matchValue: e.value,
      reason: e.reason,
      createdByUserId: e.createdByUserId ?? "",
      createdAt: iso(e.createdAt)!,
    }));
  });
}

export async function pgCreateExclusion(input: {
  tenantId: string;
  scope: "user" | "meeting" | "keyword" | "domain";
  matchValue: string;
  reason: string | null;
  createdByUserId: string;
}) {
  return withTenantContext(input.tenantId, async (db) => {
    const [row] = await db
      .insert(ingestionExclusions)
      .values({
        tenantId: input.tenantId,
        ruleType: input.scope,
        value: input.matchValue,
        scope: "all",
        reason: input.reason,
        createdByUserId: input.createdByUserId,
      })
      .returning();
    return {
      id: row!.id,
      tenantId: row!.tenantId,
      scope: input.scope,
      matchValue: row!.value,
      reason: row!.reason,
      createdByUserId: row!.createdByUserId ?? input.createdByUserId,
      createdAt: iso(row!.createdAt)!,
    };
  });
}

export async function pgDeleteExclusion(tenantId: string, id: string): Promise<boolean> {
  return withTenantContext(tenantId, async (db) => {
    const deleted = await db
      .delete(ingestionExclusions)
      .where(
        and(eq(ingestionExclusions.id, id), eq(ingestionExclusions.tenantId, tenantId)),
      )
      .returning();
    return deleted.length > 0;
  });
}

// ── Invites ────────────────────────────────────────────────────────────────

export async function pgListInvites(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(invites)
      .where(eq(invites.tenantId, tenantId));
    return rows.map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      email: i.email,
      role: i.role,
      invitedByUserId: i.invitedByUserId,
      createdAt: iso(i.createdAt)!,
      acceptedAt: iso(i.acceptedAt),
    }));
  });
}

export async function pgCreateInvite(input: {
  tenantId: string;
  email: string;
  role: "member" | "manager" | "admin";
  invitedByUserId: string;
}) {
  return withTenantContext(input.tenantId, async (db) => {
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [row] = await db
      .insert(invites)
      .values({
        tenantId: input.tenantId,
        email: input.email,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
        tokenHash,
        expiresAt: new Date(Date.now() + 14 * 86400000),
      })
      .returning();
    return {
      id: row!.id,
      tenantId: row!.tenantId,
      email: row!.email,
      role: row!.role,
      invitedByUserId: row!.invitedByUserId,
      createdAt: iso(row!.createdAt)!,
      acceptedAt: null as string | null,
      /** One-time plaintext for the invite email — never stored. */
      token,
    };
  });
}

// ── DSR ────────────────────────────────────────────────────────────────────

export async function pgListDsr(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(dsrRequests)
      .where(eq(dsrRequests.tenantId, tenantId));
    return rows.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      userId: d.userId,
      type: d.requestType,
      status:
        d.status === "completed"
          ? "fulfilled"
          : d.status === "received"
            ? "open"
            : d.status,
      createdAt: iso(d.createdAt)!,
    }));
  });
}

export async function pgCreateDsr(input: {
  tenantId: string;
  userId: string;
  type: "access" | "erasure" | "rectification" | "objection";
}) {
  return withTenantContext(input.tenantId, async (db) => {
    const [row] = await db
      .insert(dsrRequests)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        requestType: input.type,
        status: "received",
        dueAt: new Date(Date.now() + 30 * 86400000),
      })
      .returning();
    return {
      id: row!.id,
      tenantId: row!.tenantId,
      userId: row!.userId,
      type: row!.requestType,
      status: "open" as const,
      createdAt: iso(row!.createdAt)!,
    };
  });
}

export async function pgUpdateDsr(
  tenantId: string,
  id: string,
  status: "open" | "fulfilled" | "rejected",
) {
  return withTenantContext(tenantId, async (db) => {
    const mapped =
      status === "fulfilled"
        ? ("completed" as const)
        : status === "rejected"
          ? ("rejected" as const)
          : ("received" as const);
    const [row] = await db
      .update(dsrRequests)
      .set({
        status: mapped,
        completedAt: status === "fulfilled" ? new Date() : null,
      })
      .where(and(eq(dsrRequests.id, id), eq(dsrRequests.tenantId, tenantId)))
      .returning();
    if (!row) return undefined;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      type: row.requestType,
      status,
      createdAt: iso(row.createdAt)!,
    };
  });
}

// ── Review ─────────────────────────────────────────────────────────────────

export async function pgListReviewQueue(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(commitments)
      .where(
        and(
          eq(commitments.tenantId, tenantId),
          eq(commitments.reviewRequired, true),
        ),
      );
    return rows
      .filter((c) => c.status !== "cancelled")
      .map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        title: c.title,
        projectId: c.projectId,
        ownerUserId: c.ownerUserId ?? "",
        status: c.status,
        needsReview: c.reviewRequired,
        priority: c.priority,
        createdAt: iso(c.createdAt)!,
        updatedAt: iso(c.updatedAt)!,
        flowState: c.flowState,
        flowStateSince: iso(c.flowStateSince) ?? iso(c.createdAt)!,
        needsLook: c.needsLook,
      }));
  });
}

export async function pgConfirmReview(tenantId: string, id: string) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .update(commitments)
      .set({ reviewRequired: false, updatedAt: new Date() })
      .where(and(eq(commitments.id, id), eq(commitments.tenantId, tenantId)))
      .returning();
    return row ?? undefined;
  });
}

export async function pgRejectReview(tenantId: string, id: string) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .update(commitments)
      .set({
        reviewRequired: false,
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(and(eq(commitments.id, id), eq(commitments.tenantId, tenantId)))
      .returning();
    return row ?? undefined;
  });
}

// ── Surveys ────────────────────────────────────────────────────────────────

function mapSurveyStatus(
  status: string,
): "draft" | "pending_review" | "live" | "closed" {
  if (status === "collecting" || status === "sending") return "live";
  if (status === "draft") return "pending_review";
  return "closed";
}

export async function pgListSurveyCycles(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const cycles = await db
      .select()
      .from(surveyCycles)
      .where(eq(surveyCycles.tenantId, tenantId))
      .orderBy(desc(surveyCycles.createdAt));
    const out = [];
    for (const c of cycles) {
      const responses = await db
        .select()
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.tenantId, tenantId),
            eq(surveyResponses.cycleId, c.id),
          ),
        );
      out.push({
        id: c.id,
        tenantId: c.tenantId,
        title: c.theme ?? "Pulse",
        closedAt: iso(c.closedAt),
        responses: responses.map((r) => ({
          themeTags: r.answerText
            ? r.answerText
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : ["answered"],
        })),
      });
    }
    return out;
  });
}

export async function pgGetSurveyCycle(tenantId: string, cycleId: string) {
  const all = await pgListSurveyCycles(tenantId);
  return all.find((c) => c.id === cycleId);
}

export async function pgGetCurrentSurvey(tenantId: string) {
  return withTenantContext(tenantId, async (db) => {
    const [cycle] = await db
      .select()
      .from(surveyCycles)
      .where(
        and(
          eq(surveyCycles.tenantId, tenantId),
          eq(surveyCycles.status, "collecting"),
        ),
      )
      .limit(1);
    if (!cycle) return undefined;
    const questions = await db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.tenantId, tenantId),
          eq(surveyQuestions.cycleId, cycle.id),
        ),
      );
    return {
      id: cycle.id,
      tenantId: cycle.tenantId,
      title: cycle.theme ?? "Pulse",
      closedAt: iso(cycle.closedAt),
      responses: [] as { themeTags: string[] }[],
      status: mapSurveyStatus(cycle.status) as
        | "draft"
        | "pending_review"
        | "live"
        | "closed",
      questions: questions.map((q) => ({
        id: q.id,
        text: q.questionText,
        approved: q.approvedAt ? true : q.approvedByUserId === null ? null : false,
      })),
    };
  });
}

export async function pgGetSurveyReview(
  tenantId: string,
  cycleId: string,
) {
  return withTenantContext(tenantId, async (db) => {
    const [cycle] = await db
      .select()
      .from(surveyCycles)
      .where(
        and(eq(surveyCycles.id, cycleId), eq(surveyCycles.tenantId, tenantId)),
      )
      .limit(1);
    if (!cycle) return undefined;
    const questions = await db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.tenantId, tenantId),
          eq(surveyQuestions.cycleId, cycleId),
        ),
      );
    return {
      id: cycle.id,
      tenantId: cycle.tenantId,
      title: cycle.theme ?? "Pulse",
      closedAt: iso(cycle.closedAt),
      responses: [] as { themeTags: string[] }[],
      status: mapSurveyStatus(cycle.status),
      questions: questions.map((q) => ({
        id: q.id,
        text: q.questionText,
        approved: q.approvedAt ? true : null,
      })),
    };
  });
}

export async function pgSubmitSurveyAnswer(
  tenantId: string,
  cycleId: string,
  userId: string,
  themeTags: string[],
) {
  return withTenantContext(tenantId, async (db) => {
    const [cycle] = await db
      .select()
      .from(surveyCycles)
      .where(
        and(eq(surveyCycles.id, cycleId), eq(surveyCycles.tenantId, tenantId)),
      )
      .limit(1);
    if (!cycle) return undefined;
    let [question] = await db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.cycleId, cycleId),
          eq(surveyQuestions.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!question) {
      const [created] = await db
        .insert(surveyQuestions)
        .values({
          tenantId,
          cycleId,
          sortOrder: 0,
          questionText: "How is coordination going?",
          questionType: "open_text",
          topic: "coordination",
          generatedBy: "template",
        })
        .returning();
      question = created;
    }
    const respondentHash = createHash("sha256")
      .update(`${userId}:${cycleId}`)
      .digest("hex");
    await db.insert(surveyResponses).values({
      tenantId,
      cycleId,
      questionId: question.id,
      respondentHash,
      answerText: themeTags.join(","),
    });
    await db
      .update(surveyCycles)
      .set({ respondedCount: (cycle.respondedCount ?? 0) + 1 })
      .where(eq(surveyCycles.id, cycleId));
    return { ok: true as const, cycleId };
  });
}

export async function pgReviewSurveyQuestion(
  tenantId: string,
  cycleId: string,
  questionId: string,
  approved: boolean,
  approverUserId: string,
) {
  return withTenantContext(tenantId, async (db) => {
    await db
      .update(surveyQuestions)
      .set({
        approvedByUserId: approved ? approverUserId : null,
        approvedAt: approved ? new Date() : null,
      })
      .where(
        and(
          eq(surveyQuestions.id, questionId),
          eq(surveyQuestions.cycleId, cycleId),
          eq(surveyQuestions.tenantId, tenantId),
        ),
      );
    const [cycle] = await db
      .select()
      .from(surveyCycles)
      .where(
        and(eq(surveyCycles.id, cycleId), eq(surveyCycles.tenantId, tenantId)),
      )
      .limit(1);
    if (!cycle) return undefined;
    const questions = await db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.tenantId, tenantId),
          eq(surveyQuestions.cycleId, cycleId),
        ),
      );
    return {
      id: cycle.id,
      tenantId: cycle.tenantId,
      title: cycle.theme ?? "Pulse",
      closedAt: iso(cycle.closedAt),
      responses: [] as { themeTags: string[] }[],
      status: mapSurveyStatus(cycle.status),
      questions: questions.map((q) => ({
        id: q.id,
        text: q.questionText,
        approved: q.approvedAt ? true : q.approvedByUserId == null ? null : false,
      })),
    };
  });
}

// ── Milestones ─────────────────────────────────────────────────────────────

function mapMilestoneStatus(
  status: string,
): "pending" | "in_progress" | "done" | "skipped" {
  if (status === "open") return "pending";
  if (status === "cancelled") return "skipped";
  if (status === "in_progress" || status === "done") return status;
  return "pending";
}

function toPgMilestoneStatus(
  status: "pending" | "in_progress" | "done" | "skipped",
): "open" | "in_progress" | "done" | "cancelled" {
  if (status === "pending") return "open";
  if (status === "skipped") return "cancelled";
  return status;
}

export async function pgListMilestones(tenantId: string, projectId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(milestones)
      .where(
        and(
          eq(milestones.tenantId, tenantId),
          eq(milestones.projectId, projectId),
        ),
      );
    return rows.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      projectId: m.projectId,
      title: m.name,
      status: mapMilestoneStatus(m.status),
      weight: Number(m.weight ?? 1),
      dueDate: m.dueDate ? String(m.dueDate) : null,
    }));
  });
}

export async function pgUpsertMilestone(row: {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  weight: number;
  dueDate: string | null;
}) {
  return withTenantContext(row.tenantId, async (db) => {
    const [existing] = await db
      .select()
      .from(milestones)
      .where(
        and(eq(milestones.id, row.id), eq(milestones.tenantId, row.tenantId)),
      )
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(milestones)
        .set({
          name: row.title,
          status: toPgMilestoneStatus(row.status),
          weight: String(row.weight),
          dueDate: row.dueDate,
        })
        .where(eq(milestones.id, row.id))
        .returning();
      return {
        id: updated.id,
        tenantId: updated.tenantId,
        projectId: updated.projectId,
        title: updated.name,
        status: mapMilestoneStatus(updated.status),
        weight: Number(updated.weight ?? 1),
        dueDate: updated.dueDate ? String(updated.dueDate) : null,
      };
    }
    const [created] = await db
      .insert(milestones)
      .values({
        id: row.id,
        tenantId: row.tenantId,
        projectId: row.projectId,
        name: row.title,
        status: toPgMilestoneStatus(row.status),
        weight: String(row.weight),
        dueDate: row.dueDate,
      })
      .returning();
    return {
      id: created.id,
      tenantId: created.tenantId,
      projectId: created.projectId,
      title: created.name,
      status: mapMilestoneStatus(created.status),
      weight: Number(created.weight ?? 1),
      dueDate: created.dueDate ? String(created.dueDate) : null,
    };
  });
}

// ── Flow events + nudge flags ──────────────────────────────────────────────

export async function pgListFlowEvents(tenantId: string, commitmentId: string) {
  return withTenantContext(tenantId, async (db) => {
    const rows = await db
      .select()
      .from(flowEvents)
      .where(
        and(
          eq(flowEvents.tenantId, tenantId),
          eq(flowEvents.commitmentId, commitmentId),
        ),
      );
    return rows.map((e) => ({
      id: String(e.id),
      tenantId: e.tenantId,
      commitmentId: e.commitmentId,
      fromState: e.fromState,
      toState: e.toState,
      waitingOnUserId: e.waitingOnUserId,
      waitingOnExternalName: e.waitingOnExternalName,
      durationSeconds: e.durationSeconds,
      workingSeconds: e.workingSeconds,
      source: e.source,
      actor: e.actor,
      createdAt: iso(e.createdAt)!,
    }));
  });
}

export async function pgGetCommitment(tenantId: string, id: string) {
  return withTenantContext(tenantId, async (db) => {
    const [row] = await db
      .select()
      .from(commitments)
      .where(and(eq(commitments.id, id), eq(commitments.tenantId, tenantId)))
      .limit(1);
    return row ?? undefined;
  });
}

export async function pgListNudgeTriggers(tenantId: string) {
  const defaults = [
    { id: "checkin_evidence", name: "Evidence check-in" },
    { id: "unblock_request", name: "Unblock request" },
  ];
  return withTenantContext(tenantId, async (db) => {
    const flags = await db
      .select()
      .from(tenantFlags)
      .where(eq(tenantFlags.tenantId, tenantId));
    const suspended = new Set(
      flags
        .filter((f) => f.enabled && f.flag.startsWith("nudge_suspend:"))
        .map((f) => f.flag.slice("nudge_suspend:".length)),
    );
    return defaults.map((d) => ({
      id: d.id,
      name: d.name,
      precision: null as number | null,
      suspended: suspended.has(d.id),
      sends7d: 0,
    }));
  });
}

export async function pgSetNudgeSuspended(
  tenantId: string,
  triggerId: string,
  suspended: boolean,
) {
  const flag = `nudge_suspend:${triggerId}`;
  return withTenantContext(tenantId, async (db) => {
    const [existing] = await db
      .select()
      .from(tenantFlags)
      .where(and(eq(tenantFlags.tenantId, tenantId), eq(tenantFlags.flag, flag)))
      .limit(1);
    if (existing) {
      await db
        .update(tenantFlags)
        .set({ enabled: suspended })
        .where(
          and(eq(tenantFlags.tenantId, tenantId), eq(tenantFlags.flag, flag)),
        );
    } else {
      await db.insert(tenantFlags).values({
        tenantId,
        flag,
        enabled: suspended,
      });
    }
    return {
      id: triggerId,
      name:
        triggerId === "unblock_request"
          ? "Unblock request"
          : "Evidence check-in",
      precision: null as number | null,
      suspended,
      sends7d: 0,
    };
  });
}
