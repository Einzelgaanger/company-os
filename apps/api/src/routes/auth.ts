import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bindRoute } from "../lib/policy.js";
import {
  createSession,
  rotateRefresh,
  revokeSession,
  verifyPassword,
} from "../plugins/auth.js";
import { storeMode } from "../store/index.js";
import { ensureSeedUsers, findUserByEmail } from "../store/memory.js";
import { pgEnsureDemoSeed, pgFindUserByEmail } from "../store/pg.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  bindRoute("/auth/login", "POST", "public.auth.login");
  bindRoute("/auth/logout", "POST", "auth.logout");
  bindRoute("/auth/refresh", "POST", "public.auth.refresh");

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    let user: {
      id: string;
      tenantId: string;
      email: string;
      fullName: string;
      role: string;
      passwordHash: string;
    } | null = null;

    if (storeMode === "postgres") {
      await pgEnsureDemoSeed();
      user = await pgFindUserByEmail(parsed.data.email);
    } else {
      await ensureSeedUsers();
      user = findUserByEmail(parsed.data.email) ?? null;
    }

    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const session = await createSession({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return reply.send({
      ...session,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  });

  app.post(
    "/auth/logout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.auth?.sessionId) {
        await revokeSession(request.auth.sessionId);
      }
      return reply.send({ ok: true });
    },
  );

  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    const result = await rotateRefresh(parsed.data.refreshToken);
    if (!result.ok) {
      return reply.code(401).send({ error: result.reason });
    }
    return reply.send(result);
  });
}
