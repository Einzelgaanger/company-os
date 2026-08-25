import type { FastifyInstance } from "fastify";
import { bindRoute } from "../lib/policy.js";

export async function healthRoutes(app: FastifyInstance) {
  bindRoute("/health", "GET", "public.health");
  app.get("/health", async () => ({
    ok: true,
    service: "@loop/api",
    ts: new Date().toISOString(),
  }));
}
