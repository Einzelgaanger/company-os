import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { bindRoute } from "../lib/policy.js";
import { ensureSeedUsers } from "../store/memory.js";
import {
  getReportPlane,
  listProjectsPlane,
  listReportsPlane,
  saveReportPlane,
} from "../store/tenantPlane.js";
import {
  assembleReportContent,
  persistReportPdf,
  renderSectionsToPdf,
} from "../lib/reportPdf.js";

/**
 * Report generate + PDF download (10_REPORTING).
 * Generates synchronously for local plane; worker path can enqueue the same assembler.
 */
export async function reportRoutes(app: FastifyInstance) {
  bindRoute("/reports", "GET", "report.view_org");
  bindRoute("/reports/generate", "POST", "report.configure");
  bindRoute("/reports/:id", "GET", "report.view_org");
  bindRoute("/reports/:id/pdf", "GET", "report.view_org");
  bindRoute("/reports/:id/regenerate", "POST", "report.configure");

  app.get("/reports", { preHandler: [app.authenticate] }, async (req) => {
    await ensureSeedUsers();
    return { items: await listReportsPlane(req.auth!.tenantId) };
  });

  app.post("/reports/generate", { preHandler: [app.authenticate] }, async (req, reply) => {
    await ensureSeedUsers();
    const tenantId = req.auth!.tenantId;
    const id = randomUUID();
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

    const projects = (await listProjectsPlane(tenantId)).map((p) => ({
      name: p.name,
      progressPct: 50,
      health: "on_track",
      feverZone: "unknown",
    }));

    const assembled = assembleReportContent({
      tenantId,
      teamScopeUserIds: [req.auth!.userId],
      projectSummaries: projects,
      waitingTeamDays: 0,
    });

    let pdfRef: string | null = null;
    let pdfSha256: string | null = null;
    let status: "ready" | "failed" = "ready";
    try {
      const pdf = await renderSectionsToPdf(assembled.sections, assembled.footer);
      const stored = persistReportPdf(tenantId, id, pdf);
      pdfRef = stored.pdfRef;
      pdfSha256 = stored.pdfSha256;
    } catch {
      status = "failed";
    }

    const row = await saveReportPlane({
      id,
      tenantId,
      type: "weekly",
      periodStart,
      periodEnd,
      contentMd: assembled.sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n"),
      contentHtml: assembled.html,
      pdfRef,
      pdfSha256,
      status,
      createdAt: now.toISOString(),
    });

    return reply.code(201).send(row);
  });

  app.get<{ Params: { id: string } }>(
    "/reports/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await getReportPlane(req.auth!.tenantId, req.params.id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      return row;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/reports/:id/pdf",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await getReportPlane(req.auth!.tenantId, req.params.id);
      if (!row) return reply.code(404).send({ error: "not_found" });
      if (!row.pdfRef || row.status !== "ready") {
        return reply.code(409).send({ error: "pdf_not_ready", status: row.status });
      }
      if (row.pdfRef.startsWith("file://")) {
        const path = row.pdfRef.replace(/^file:\/\//, "").replace(/\//g, process.platform === "win32" ? "\\" : "/");
        const local = decodeURIComponent(
          row.pdfRef.startsWith("file:///")
            ? row.pdfRef.slice("file:///".length)
            : row.pdfRef.slice("file://".length),
        ).replace(/\//g, process.platform === "win32" ? "\\" : "/");
        if (!existsSync(local) && !existsSync(path)) {
          return reply.code(404).send({ error: "pdf_file_missing" });
        }
        const filePath = existsSync(local) ? local : path;
        reply.header("Content-Type", "application/pdf");
        reply.header("Content-Disposition", `attachment; filename="loop-report-${row.id}.pdf"`);
        return reply.send(createReadStream(filePath));
      }
      return reply.code(501).send({
        error: "pdf_remote_not_streamed",
        pdfRef: row.pdfRef,
        pdfSha256: row.pdfSha256,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/reports/:id/regenerate",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const existing = await getReportPlane(req.auth!.tenantId, req.params.id);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      const projects = (await listProjectsPlane(req.auth!.tenantId)).map((p) => ({
        name: p.name,
        progressPct: 50,
        health: "on_track" as const,
      }));
      const assembled = assembleReportContent({
        tenantId: req.auth!.tenantId,
        teamScopeUserIds: [req.auth!.userId],
        projectSummaries: projects,
      });
      try {
        const pdf = await renderSectionsToPdf(assembled.sections, assembled.footer);
        const stored = persistReportPdf(req.auth!.tenantId, existing.id, pdf);
        const row = await saveReportPlane({
          ...existing,
          contentMd: assembled.sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n"),
          contentHtml: assembled.html,
          pdfRef: stored.pdfRef,
          pdfSha256: stored.pdfSha256,
          status: "ready",
        });
        return row;
      } catch (e) {
        await saveReportPlane({ ...existing, status: "failed" });
        return reply.code(500).send({
          error: "pdf_generation_failed",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );
}
