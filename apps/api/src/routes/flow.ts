import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  agingWip,
  can,
  flowSummary,
  waitingRegister,
  type AuthUser,
  type Role,
  type WaitingKind,
  type WaitingRow,
} from "@loop/shared";
import { bindRoute } from "../lib/policy.js";
import { loadFlowContext, type FlowScope } from "../store/flow.js";

/**
 * B2 — the flow reads behind `/flow` and `/waiting` (08_PAGES §8.4, §8.5).
 *
 * Every figure here is working time from `flow_events` (04_FLOW_ENGINE §4.4);
 * nothing is a count of items per person, and nothing can be aggregated into
 * one, because the responses carry no per-person totals at all (§4.9).
 */

const scopeQuery = z.object({
  scope: z.enum(["self", "team", "org"]).optional(),
});

const waitingQuery = scopeQuery.extend({
  group: z.enum(["holder", "project"]).optional(),
  sort: z.enum(["cost", "age", "project"]).optional(),
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const WAITING_KINDS: readonly WaitingKind[] = [
  "internal",
  "external",
  "decision",
  "dependency",
  "review",
];

function toAuthUser(auth: { userId: string; tenantId: string; role: string }): AuthUser {
  return {
    id: auth.userId,
    tenantId: auth.tenantId,
    role: auth.role as Role,
    managerId: null,
  };
}

/**
 * Scopes above the role are refused, not silently widened — and the SPA omits
 * them from the switcher rather than disabling them (§8.4 "Permission").
 */
function resolveScope(user: AuthUser, requested: FlowScope | undefined): FlowScope | null {
  const scope = requested ?? "self";
  if (scope === "self") return can(user, "flow.view") ? "self" : null;
  if (scope === "team") {
    return can(user, "flow.view_team", { scope: "team", inCallerTeam: true }) ? "team" : null;
  }
  return can(user, "flow.view_org") ? "org" : null;
}

/** The scopes to render in the switcher, so the UI mirrors the matrix exactly. */
function allowedScopes(user: AuthUser): FlowScope[] {
  const scopes: FlowScope[] = [];
  if (can(user, "flow.view")) scopes.push("self");
  if (can(user, "flow.view_team", { scope: "team", inCallerTeam: true })) scopes.push("team");
  if (can(user, "flow.view_org")) scopes.push("org");
  return scopes;
}

function parseTypes(raw: string | undefined): WaitingKind[] | null {
  if (!raw) return null;
  const wanted = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is WaitingKind => (WAITING_KINDS as readonly string[]).includes(s));
  return wanted.length > 0 ? wanted : null;
}

function sortRows(rows: WaitingRow[], sort: "cost" | "age" | "project"): WaitingRow[] {
  const sorted = [...rows];
  if (sort === "age") sorted.sort((a, b) => b.workingSeconds - a.workingSeconds);
  else if (sort === "project") {
    sorted.sort((a, b) =>
      (a.projectName ?? "\uffff").localeCompare(b.projectName ?? "\uffff") ||
      b.costScore - a.costScore,
    );
  }
  // 'cost' is the register's natural order (§4.3), already applied.
  return sorted;
}

export async function flowRoutes(app: FastifyInstance) {
  bindRoute("/flow/summary", "GET", "flow.view");
  bindRoute("/flow/aging", "GET", "flow.view");
  bindRoute("/waiting", "GET", "flow.view");

  const withScope = async <T extends { scope?: FlowScope }>(
    req: FastifyRequest,
    reply: FastifyReply,
    query: T,
  ) => {
    const user = toAuthUser(req.auth!);
    const scope = resolveScope(user, query.scope);
    if (!scope) {
      reply.code(403).send({ error: "forbidden", action: "flow.view" });
      return null;
    }
    const context = await loadFlowContext(req.auth!.tenantId, req.auth!.userId, scope);
    return { user, scope, context };
  };

  app.get("/flow/summary", { preHandler: [app.authenticate] }, async (req, reply) => {
    const query = scopeQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });

    const resolved = await withScope(req, reply, query.data);
    if (!resolved) return reply;
    const { user, scope, context } = resolved;

    return {
      scope,
      allowedScopes: allowedScopes(user),
      ...flowSummary({
        commitments: context.commitments,
        events: context.events,
        settings: context.settings,
        wipLimit: context.wipLimit,
      }),
    };
  });

  app.get("/flow/aging", { preHandler: [app.authenticate] }, async (req, reply) => {
    const query = scopeQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });

    const resolved = await withScope(req, reply, query.data);
    if (!resolved) return reply;
    const { scope, context } = resolved;

    return {
      scope,
      ...agingWip({
        commitments: context.commitments,
        events: context.events,
        settings: context.settings,
      }),
    };
  });

  app.get("/waiting", { preHandler: [app.authenticate] }, async (req, reply) => {
    const query = waitingQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });

    const resolved = await withScope(req, reply, query.data);
    if (!resolved) return reply;
    const { scope, context } = resolved;

    const register = waitingRegister({
      commitments: context.commitments,
      events: context.events,
      settings: context.settings,
    });

    const types = parseTypes(query.data.types);
    const filtered = types
      ? register.items.filter((row) => types.includes(row.waitingKind))
      : register.items;

    const sorted = sortRows(filtered, query.data.sort ?? "cost");
    const limit = query.data.limit;

    return {
      scope,
      group: query.data.group ?? "holder",
      sort: query.data.sort ?? "cost",
      // Totals describe the whole register, so a `limit` on the preview never
      // makes the headline number disagree with /waiting itself.
      totals: register.totals,
      filteredCount: sorted.length,
      items: limit ? sorted.slice(0, limit) : sorted,
      byHolder: register.byHolder,
      byProject: register.byProject,
    };
  });
}
