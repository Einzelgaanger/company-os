/**
 * Authorization matrix from 03_IDENTITY_ACCESS.md §3.2.
 * Fail closed: unknown actions return false.
 */

export type Role = "member" | "manager" | "admin" | "owner";

export type AuthUser = {
  id: string;
  tenantId: string;
  role: Role;
  managerId: string | null;
};

/** Optional resource context for own/team scoping. */
export type AuthResource = {
  /** Subject owner (commitment, connection, etc.) */
  ownerUserId?: string | null;
  /** True when the subject is in the caller's management/team scope */
  inCallerTeam?: boolean;
  /** Escalation assignee */
  assignedToUserId?: string | null;
  /** Report / dashboard scope */
  scope?: "own" | "team" | "org";
};

export type Action =
  | "commitment.read_own"
  | "commitment.read"
  | "commitment.create"
  | "commitment.update_own"
  | "commitment.delete"
  | "commitment.reassign"
  | "commitment.checkin_manual"
  | "commitment.escalate_manual"
  | "my_data.view"
  | "dsr.submit"
  | "connection.own"
  | "whatsapp.opt"
  | "project.view_team"
  | "project.create"
  | "project.edit"
  | "milestone.manage"
  | "escalation.acknowledge"
  | "escalation.resolve"
  | "flow.view"
  | "flow.view_team"
  | "flow.view_org"
  | "dashboard.view_org"
  | "invite.create"
  | "user.set_manager"
  | "user.set_team"
  | "user.set_role"
  | "ownership_map.manage"
  | "ingestion_exclusion.manage"
  | "connection.org_manage"
  | "messaging.send"
  | "messaging.approve"
  | "sso.manage"
  | "survey.approve"
  | "report.configure"
  | "report.view_team"
  | "report.view_org"
  | "audit.view"
  | "dsr.handle"
  | "retention.set"
  | "compliance.attest"
  | "tenant.export"
  | "tenant.billing"
  | "tenant.delete"
  | "auth.logout";

type Scope = "any" | "own" | "team" | "assigned_or_team";

type Policy = {
  roles: readonly Role[];
  scope?: Scope;
};

const ALL: Role[] = ["member", "manager", "admin", "owner"];
const MGR_UP: Role[] = ["manager", "admin", "owner"];
const ADMIN_UP: Role[] = ["admin", "owner"];
const OWNER_ONLY: Role[] = ["owner"];

/**
 * Declarative policy map. Keys are the only recognized actions.
 * Anything not listed fails closed.
 */
const POLICIES: Record<Action, Policy> = {
  "commitment.read_own": { roles: ALL, scope: "own" },
  "commitment.read": { roles: MGR_UP, scope: "team" },
  "commitment.create": { roles: MGR_UP, scope: "team" },
  "commitment.update_own": { roles: ALL, scope: "own" },
  "commitment.delete": { roles: MGR_UP, scope: "team" },
  "commitment.reassign": { roles: MGR_UP, scope: "team" },
  "commitment.checkin_manual": { roles: MGR_UP, scope: "team" },
  "commitment.escalate_manual": { roles: MGR_UP, scope: "team" },
  "my_data.view": { roles: ALL },
  "dsr.submit": { roles: ALL },
  "connection.own": { roles: ALL, scope: "own" },
  "whatsapp.opt": { roles: ALL },
  "project.view_team": { roles: MGR_UP, scope: "team" },
  "project.create": { roles: MGR_UP, scope: "team" },
  "project.edit": { roles: MGR_UP, scope: "team" },
  "milestone.manage": { roles: MGR_UP, scope: "team" },
  "escalation.acknowledge": { roles: ALL, scope: "assigned_or_team" },
  "escalation.resolve": { roles: ALL, scope: "assigned_or_team" },
  // 08_PAGES §8.2 — /flow and /waiting are scoped, not gated: everyone sees
  // their own, managers their team, admins the organization.
  "flow.view": { roles: ALL, scope: "own" },
  "flow.view_team": { roles: MGR_UP, scope: "team" },
  "flow.view_org": { roles: ADMIN_UP },
  "dashboard.view_org": { roles: ADMIN_UP },
  "invite.create": { roles: ADMIN_UP },
  "user.set_manager": { roles: ADMIN_UP },
  "user.set_team": { roles: ADMIN_UP },
  "user.set_role": { roles: ADMIN_UP },
  "ownership_map.manage": { roles: ADMIN_UP },
  "ingestion_exclusion.manage": { roles: ADMIN_UP },
  "connection.org_manage": { roles: ADMIN_UP },
  "messaging.send": { roles: ADMIN_UP },
  "messaging.approve": { roles: ADMIN_UP },
  "sso.manage": { roles: ADMIN_UP },
  "survey.approve": { roles: ADMIN_UP },
  "report.configure": { roles: ADMIN_UP },
  "report.view_team": { roles: MGR_UP, scope: "team" },
  "report.view_org": { roles: ADMIN_UP },
  "audit.view": { roles: ADMIN_UP },
  "dsr.handle": { roles: ADMIN_UP },
  "retention.set": { roles: ADMIN_UP },
  "compliance.attest": { roles: ADMIN_UP },
  "tenant.export": { roles: OWNER_ONLY },
  "tenant.billing": { roles: OWNER_ONLY },
  "tenant.delete": { roles: OWNER_ONLY },
  "auth.logout": { roles: ALL },
};

function isAction(action: string): action is Action {
  return Object.prototype.hasOwnProperty.call(POLICIES, action);
}

function scopeAllows(
  scope: Scope | undefined,
  user: AuthUser,
  resource?: AuthResource,
): boolean {
  if (!scope || scope === "any") return true;

  // Capability-only check when no resource is supplied.
  if (!resource) {
    if (user.role === "admin" || user.role === "owner") return true;
    if (scope === "own") return true;
    if (scope === "team") return user.role === "manager";
    if (scope === "assigned_or_team") return true;
    return false;
  }

  if (user.role === "admin" || user.role === "owner") return true;

  switch (scope) {
    case "own":
      return resource.ownerUserId === user.id;
    case "team":
      if (user.role !== "manager") return false;
      if (resource.ownerUserId === user.id) return true;
      return resource.inCallerTeam === true;
    case "assigned_or_team":
      if (resource.assignedToUserId === user.id) return true;
      if (user.role === "manager" && resource.inCallerTeam === true) return true;
      if (user.role === "member" && resource.assignedToUserId === user.id) return true;
      return false;
    default:
      return false;
  }
}

/**
 * Returns whether `user` may perform `action` on an optional `resource`.
 * Unknown actions always return false (fail closed).
 */
export function can(
  user: AuthUser,
  action: string,
  resource?: AuthResource,
): boolean {
  if (!user?.role || !isAction(action)) return false;
  const policy = POLICIES[action];
  if (!policy.roles.includes(user.role)) return false;
  return scopeAllows(policy.scope, user, resource);
}

/** All known action strings (for route binding / boot assertions). */
export const ALL_ACTIONS: readonly Action[] = Object.keys(POLICIES) as Action[];
