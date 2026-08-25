/**
 * Offline API client for Fastify (@loop/api).
 * When VITE_API_URL is unset, callers keep using the SPA mock db.
 */
import type {
  AgingResponse,
  FlowScope,
  FlowSummaryResponse,
  WaitingResponse,
} from "./flow";

const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const ACCESS_KEY = "loop.api.accessToken";
const REFRESH_KEY = "loop.api.refreshToken";

export function apiConfigured(): boolean {
  return Boolean(BASE);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setApiTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearApiTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string } = {},
): Promise<T> {
  if (!BASE) throw new Error("VITE_API_URL not set");
  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");
  const token = opts.token === "" ? null : (opts.token ?? getAccessToken());
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type ApiReviewItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  needsReview: boolean;
  ownerUserId: string;
  projectId: string | null;
};

/** A3 — legal records live in `tenant_compliance` / `users`, read over the API. */
export type ApiComplianceRecord = {
  tenantId: string;
  attestedByUserId: string | null;
  attestedAt: string | null;
  lawfulBasis: string;
  high_risk_use_prohibited: true;
  payload: Record<string, unknown>;
};

export type ApiNoticeAck = {
  userId: string;
  at: string;
  version: string | null;
};

export type ApiMessageApproval = {
  id: string;
  tenantId: string;
  recipientUserId: string | null;
  templateKey: string;
  preview: string;
  status: string;
  createdAt: string;
};

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  login: async (email: string, password: string) => {
    const res = await request<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; role: string; tenantId: string };
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      token: "",
    });
    // Clear Authorization for login — request still sent token if any; override:
    setApiTokens(res.accessToken, res.refreshToken);
    return res;
  },
  refresh: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) throw new Error("no_refresh");
    const res = await request<{ accessToken: string; refreshToken: string }>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        token: "",
      },
    );
    setApiTokens(res.accessToken, res.refreshToken);
    return res;
  },
  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST" });
    } finally {
      clearApiTokens();
    }
  },
  listReview: () =>
    request<{
      items: ApiReviewItem[];
      stale?: Array<
        ApiReviewItem & { needsLook?: boolean; prompt?: string; needsLookReason?: string | null }
      >;
    }>("/review"),
  confirmReview: (id: string) =>
    request<{ activated: boolean; item: ApiReviewItem }>(
      `/review/${id}/confirm`,
      { method: "POST" },
    ),
  rejectReview: (id: string) =>
    request<{ rejected: boolean; item: ApiReviewItem }>(
      `/review/${id}/reject`,
      { method: "POST" },
    ),
  listSurveys: () => request<{ items: unknown[] }>("/surveys"),
  surveyAggregate: (cycleId: string) =>
    request(`/surveys/${cycleId}/aggregate`),
  listConnections: () => request<{ items: unknown[] }>("/connections"),
  connectionsHealth: () =>
    request<{ items: unknown[]; alerts: unknown[] }>("/connections/health"),
  listCommitments: () =>
    request<{
      tenantId: string;
      items: Array<{
        id: string;
        tenantId: string;
        title: string;
        status: string;
        ownerUserId: string | null;
        projectId: string | null;
        needsReview: boolean;
        priority: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>("/commitments"),
  attestCompliance: (body: unknown) =>
    request<ApiComplianceRecord>("/onboarding/compliance/attest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getCompliance: () =>
    request<ApiComplianceRecord>("/onboarding/compliance"),
  ackNotice: (version: string) =>
    request<ApiNoticeAck>("/onboarding/notice/ack", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  getNoticeAck: () => request<ApiNoticeAck>("/onboarding/notice"),
  publishNotice: (version: string) =>
    request<{ tenantId: string; version: string }>("/compliance/notice/publish", {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  listMessageApprovals: () =>
    request<{ items: ApiMessageApproval[] }>("/messaging/approvals"),
  queueMessage: (body: {
    templateKey: string;
    preview: string;
    recipientUserId?: string;
  }) =>
    request<{ queued: boolean; approval: ApiMessageApproval }>("/messaging/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  decideMessageApproval: (id: string, approved: boolean) =>
    request<ApiMessageApproval>(`/messaging/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }),
  /** B2 — 08_PAGES §8.4, §8.5. Every figure is working time from flow_events. */
  flowSummary: (scope?: FlowScope) =>
    request<FlowSummaryResponse>(`/flow/summary${queryString({ scope })}`),
  flowAging: (scope?: FlowScope) =>
    request<AgingResponse>(`/flow/aging${queryString({ scope })}`),
  waiting: (params: {
    scope?: FlowScope;
    group?: "holder" | "project";
    sort?: "cost" | "age" | "project";
    types?: string;
    limit?: number;
  } = {}) => request<WaitingResponse>(`/waiting${queryString(params)}`),
  getSweepStatus: () =>
    request<{
      lastRunAt: string | null;
      nextDueAt: string | null;
      notes: string[];
    }>("/admin/sweeps/status"),
  runSweep: () =>
    request<{
      ranAt: string;
      nextDueAt?: string;
      notes?: string[];
    }>("/admin/sweeps/run", { method: "POST" }),

  me: () =>
    request<{
      user: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        tenantId: string;
        managerId: string | null;
        status?: string;
      };
      org: { id: string; name: string; slug: string };
    }>("/auth/me"),
  getOrg: () =>
    request<{
      id: string;
      name: string;
      slug: string;
      settings?: { timezone?: string; escalation_sla_hours?: number };
    }>("/org"),
  listUsers: () =>
    request<{
      items: Array<{
        id: string;
        email: string;
        fullName: string;
        role: string;
        tenantId: string;
        managerId: string | null;
        status?: string;
      }>;
    }>("/users"),
  listProjects: () =>
    request<{
      items: Array<{
        id: string;
        tenantId: string;
        name: string;
        costOfDelayBand?: string;
        status?: string;
      }>;
    }>("/projects"),

  authorizeConnection: (provider: string) =>
    request<{ authUrl: string; state: string; provider: string }>(
      `/connections/${provider}/authorize`,
    ),
  disconnectConnection: (id: string) =>
    request<{ disconnected: boolean }>(`/connections/${id}/disconnect`, {
      method: "POST",
    }),

  listReports: () =>
    request<{
      items: Array<{
        id: string;
        tenantId: string;
        type: "weekly" | "daily";
        periodStart: string;
        periodEnd: string;
        contentMd: string;
        pdfRef: string | null;
        pdfSha256: string | null;
        status: string;
        createdAt: string;
      }>;
    }>("/reports"),
  getReport: (id: string) =>
    request<{
      id: string;
      tenantId: string;
      type: "weekly" | "daily";
      periodStart: string;
      periodEnd: string;
      contentMd: string;
      pdfRef: string | null;
      pdfSha256: string | null;
      status: string;
      createdAt: string;
    }>(`/reports/${id}`),
  generateReport: () =>
    request<{
      id: string;
      pdfRef: string | null;
      status: string;
    }>("/reports/generate", { method: "POST" }),
  reportPdfUrl: (id: string) => `${BASE}/reports/${id}/pdf`,

  launchStatus: () => request<Record<string, unknown>>("/settings/launch"),
  patchLaunch: (body: Record<string, unknown>) =>
    request("/settings/launch", { method: "PATCH", body: JSON.stringify(body) }),
  ssoStatus: () =>
    request<{ configured: boolean; missing: string[] }>("/auth/sso/status"),
  ssoAuthorize: () => request<{ authUrl: string }>("/auth/sso/authorize"),

  listExclusions: () =>
    request<{
      items: Array<{
        id: string;
        scope: string;
        matchValue: string;
        reason: string | null;
        createdAt: string;
      }>;
    }>("/ingestion/exclusions"),
  createExclusion: (body: {
    scope: "user" | "meeting" | "keyword" | "domain";
    matchValue: string;
    reason?: string;
  }) =>
    request("/ingestion/exclusions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteExclusion: (id: string) =>
    request<void>(`/ingestion/exclusions/${id}`, { method: "DELETE" }),

  listHolidays: () =>
    request<{ items: Array<{ id: string; date: string; name: string }> }>(
      "/settings/holidays",
    ),
  addHoliday: (body: { date: string; name: string }) =>
    request("/settings/holidays", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteHoliday: (id: string) =>
    request<void>(`/settings/holidays/${id}`, { method: "DELETE" }),

  nudgeQuality: () =>
    request<{
      note: string;
      autoSuspendThreshold: number;
      triggers: Array<{
        id: string;
        name: string;
        precision: number | null;
        suspended: boolean;
        sends7d: number;
      }>;
    }>("/settings/nudge-quality"),
  suspendNudge: (id: string) =>
    request(`/settings/nudge-quality/${id}/suspend`, { method: "POST" }),
  resumeNudge: (id: string) =>
    request(`/settings/nudge-quality/${id}/resume`, { method: "POST" }),

  commitmentFlow: (id: string) =>
    request<{
      commitmentId: string;
      flowState: string;
      flowStateSince: string;
      waitingDays: number;
      workingDays: number;
      workingSeconds: number;
      waitingSeconds: number;
      summary: string;
      segments: Array<{
        state: string;
        from: string;
        to: string;
        workingDays: number;
        kind: string;
      }>;
    }>(`/commitments/${id}/flow`),
};
