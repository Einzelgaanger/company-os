import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";
import { storeMode } from "../store/index.js";
import {
  ensureSeedUsers,
  findUserById,
  listUsers,
} from "../store/memory.js";
import { listProjectsPlane } from "../store/tenantPlane.js";
import { pgEnsureDemoSeed } from "../store/pg.js";
import { withTenantContext, schema } from "@loop/db";
import { eq } from "drizzle-orm";

/**
 * Session identity + org/users/projects reads for the SPA API plane.
 */
export async function meRoutes(app: FastifyInstance) {
  bindRoute("/auth/me", "GET", "my_data.view");
  bindRoute("/org", "GET", "dashboard.view_org");
  bindRoute("/users", "GET", "commitment.read");
  bindRoute("/projects", "GET", "project.view_team");

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (storeMode === "postgres") {
      await pgEnsureDemoSeed();
      const row = await withTenantContext(req.auth!.tenantId, async (db) => {
        const [u] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, req.auth!.userId));
        return u;
      });
      if (!row) return reply.code(404).send({ error: "not_found" });
      return {
        user: {
          id: row.id,
          email: row.email,
          fullName: row.fullName,
          role: row.role,
          tenantId: row.tenantId,
          managerId: row.managerId,
          status: row.status,
        },
        org: {
          id: row.tenantId,
          name: "ProDG Studios",
          slug: "prodg",
        },
      };
    }

    await ensureSeedUsers();
    const u = findUserById(req.auth!.userId);
    if (!u) return reply.code(404).send({ error: "not_found" });
    return {
      user: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        tenantId: u.tenantId,
        managerId: u.managerId,
        status: "active",
      },
      org: {
        id: u.tenantId,
        name: "ProDG Studios",
        slug: "prodg",
      },
    };
  });

  app.get("/org", { preHandler: [app.authenticate] }, async (req) => {
    await ensureSeedUsers();
    return {
      id: req.auth!.tenantId,
      name: "ProDG Studios",
      slug: "prodg",
      settings: {
        timezone: "Africa/Nairobi",
        escalation_sla_hours: 24,
      },
    };
  });

  app.get("/users", { preHandler: [app.authenticate] }, async (req) => {
    await ensureSeedUsers();
    if (storeMode === "postgres") {
      const rows = await withTenantContext(req.auth!.tenantId, async (db) => {
        return db.select().from(schema.users);
      });
      return {
        items: rows.map((u) => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          role: u.role,
          tenantId: u.tenantId,
          managerId: u.managerId,
          status: u.status,
        })),
      };
    }
    return {
      items: listUsers(req.auth!.tenantId).map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        tenantId: u.tenantId,
        managerId: u.managerId,
        status: "active",
      })),
    };
  });

  app.get("/projects", { preHandler: [app.authenticate] }, async (req) => {
    await ensureSeedUsers();
    const items = await listProjectsPlane(req.auth!.tenantId);
    return {
      items: items.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        name: p.name,
        costOfDelayBand: p.costOfDelayBand,
        status: "status" in p ? p.status : "active",
      })),
    };
  });
}
