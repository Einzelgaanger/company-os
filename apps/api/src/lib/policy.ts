/**
 * Route policy registry — every registered HTTP route must declare an action.
 * Boot fails closed if any route is unbound.
 * Authorization is enforced in middleware via requireBoundAction (handlers cannot skip).
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { can, type AuthUser, type Role } from "@loop/shared";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

type BindingKey = `${HttpMethod} ${string}`;

const bindings = new Map<BindingKey, string>();
const registeredRoutes = new Set<BindingKey>();

/** Actions that do not require a session (login, health, refresh). */
const PUBLIC_PREFIX = "public.";

function normalizePath(path: string): string {
  if (!path) return "/";
  const trimmed = path.replace(/\/+/g, "/");
  if (trimmed.length > 1 && trimmed.endsWith("/")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

function key(method: string, path: string): BindingKey {
  return `${method.toUpperCase() as HttpMethod} ${normalizePath(path)}`;
}

/** Match /commitments/:id style patterns to request URLs. */
export function matchBoundAction(
  method: string,
  path: string,
): string | undefined {
  const exact = bindings.get(key(method, path));
  if (exact) return exact;
  const methodUpper = method.toUpperCase();
  for (const [k, action] of bindings) {
    const [m, pattern] = k.split(" ") as [string, string];
    if (m !== methodUpper) continue;
    const parts = pattern.split("/").filter(Boolean);
    const pathParts = normalizePath(path).split("/").filter(Boolean);
    if (parts.length !== pathParts.length) continue;
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) continue;
      if (parts[i] !== pathParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return action;
  }
  return undefined;
}

/** Declare the authz action required for a route. */
export function bindRoute(
  path: string,
  method: HttpMethod | string,
  action: string,
): void {
  const k = key(method, path);
  if (bindings.has(k) && bindings.get(k) !== action) {
    throw new Error(
      `policy: conflicting bind for ${k}: ${bindings.get(k)} vs ${action}`,
    );
  }
  bindings.set(k, action);
}

export function trackRoute(path: string, method: string): void {
  const m = method.toUpperCase();
  if (m === "HEAD" || m === "OPTIONS") return;
  registeredRoutes.add(key(m, path));
}

export function getBoundAction(
  path: string,
  method: string,
): string | undefined {
  return bindings.get(key(method, path));
}

export function assertAllRoutesBound(): void {
  const unbound: string[] = [];
  for (const route of registeredRoutes) {
    if (!bindings.has(route)) {
      unbound.push(route);
    }
  }
  if (unbound.length > 0) {
    unbound.sort();
    throw new Error(
      `policy: unbound routes (fail closed):\n  - ${unbound.join("\n  - ")}`,
    );
  }
}

export function listBindings(): ReadonlyMap<BindingKey, string> {
  return bindings;
}

export function isPublicAction(action: string): boolean {
  return action.startsWith(PUBLIC_PREFIX);
}

/**
 * Global preHandler: resolve bound action and call can().
 * Public actions skip auth. All others require req.auth + can().
 * Delete this hook from app.ts and authz.spec.ts must fail.
 *
 * Uses routeOptions.url (pattern) so /commitments/:id matches bindRoute.
 */
export async function requireBoundAction(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const pattern = req.routeOptions?.url;
  if (!pattern) return; // not a finished route yet

  const action =
    getBoundAction(pattern, req.method) ??
    matchBoundAction(req.method, req.url.split("?")[0]);

  if (!action) {
    return reply
      .code(500)
      .send({ error: "unbound_route", path: pattern, method: req.method });
  }

  if (isPublicAction(action)) {
    return;
  }

  if (action.startsWith("guard.")) {
    return reply.code(403).send({ error: "forbidden", action });
  }

  if (!req.auth) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const user: AuthUser = {
    id: req.auth.userId,
    tenantId: req.auth.tenantId,
    role: req.auth.role as Role,
    managerId: null,
  };

  const teamish =
    action.includes(".view_team") ||
    action.includes(".create") ||
    action.includes(".delete") ||
    action.includes(".reassign") ||
    action.includes(".manage") ||
    action.includes(".edit") ||
    action.startsWith("project.") ||
    action.startsWith("milestone.") ||
    action === "commitment.read" ||
    action === "report.view_team";

  const resource = teamish
    ? { scope: "team" as const, inCallerTeam: true }
    : undefined;

  if (!can(user, action, resource)) {
    return reply.code(403).send({ error: "forbidden", action });
  }
}

export function resetPolicyForTests(): void {
  bindings.clear();
  registeredRoutes.clear();
}
