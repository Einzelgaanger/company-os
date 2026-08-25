/**
 * Flow data loading for /flow, /waiting and /my-work.
 *
 * When VITE_API_URL is set these are thin passes over `GET /flow/summary`,
 * `/flow/aging` and `/waiting`, which are authoritative. Otherwise the offline
 * mock plane derives the same shapes from the SPA's seed so the screens work in
 * dev. Scope is enforced server-side either way; the client filter below only
 * mirrors it for the mock plane.
 */

import { api, apiConfigured } from "./api";
import { db, visibleCommitments } from "./db";
import {
  mockAging,
  mockFlowSummary,
  mockWaitingRegister,
  type AgingResponse,
  type FlowScope,
  type FlowSummaryResponse,
  type WaitingResponse,
} from "./flow";
import { roleAtLeast, type Commitment, type Role, type User } from "./types";

/** 08_PAGES §8.2 — self for everyone, team for manager+, org for admin+. */
export function allowedScopesFor(role: Role): FlowScope[] {
  const scopes: FlowScope[] = ["self"];
  if (roleAtLeast(role, "manager")) scopes.push("team");
  if (roleAtLeast(role, "admin")) scopes.push("org");
  return scopes;
}

export function defaultScopeFor(role: Role): FlowScope {
  if (roleAtLeast(role, "admin")) return "org";
  if (roleAtLeast(role, "manager")) return "team";
  return "self";
}

async function mockInput(user: User, scope: FlowScope) {
  const [allCommitments, users, projects] = await Promise.all([
    db.listCommitments(user.org_id),
    db.listUsers(user.org_id),
    db.listProjects(user.org_id),
  ]);

  const visible = visibleCommitments(user, allCommitments, users);
  return {
    commitments: scopeFilter(visible, users, user, scope),
    users,
    projects,
    scope,
    allowedScopes: allowedScopesFor(user.role),
  };
}

function scopeFilter(
  commitments: Commitment[],
  users: User[],
  viewer: User,
  scope: FlowScope,
): Commitment[] {
  if (scope === "org") return commitments;
  const reports = new Set(
    users.filter((u) => u.manager_id === viewer.id).map((u) => u.id),
  );
  return commitments.filter((c) => {
    if (c.owner_id === viewer.id || c.requested_by_id === viewer.id) return true;
    if (scope === "self") return false;
    return Boolean(c.owner_id && reports.has(c.owner_id));
  });
}

export async function fetchFlowSummary(
  user: User,
  scope: FlowScope,
): Promise<FlowSummaryResponse> {
  if (apiConfigured()) return api.flowSummary(scope);
  return mockFlowSummary(await mockInput(user, scope));
}

export async function fetchFlowAging(user: User, scope: FlowScope): Promise<AgingResponse> {
  if (apiConfigured()) return api.flowAging(scope);
  return mockAging(await mockInput(user, scope));
}

export async function fetchWaiting(
  user: User,
  scope: FlowScope,
  params: { limit?: number } = {},
): Promise<WaitingResponse> {
  if (apiConfigured()) return api.waiting({ scope, ...params });
  const register = mockWaitingRegister(await mockInput(user, scope));
  return params.limit
    ? { ...register, items: register.items.slice(0, params.limit) }
    : register;
}
