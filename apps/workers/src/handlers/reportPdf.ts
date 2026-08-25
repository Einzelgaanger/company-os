/**
 * Server-side report PDF — HTML sections → PDF bytes + sha256.
 * Uses pdfkit (no browser dependency) so CI and workers stay portable.
 * Design §10 Playwright path can replace renderHtmlToPdf later without changing the route contract.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { REPORT_FOOTER, reportSectionSpecs } from "@loop/shared";

export const REPORT_C1_DISCLAIMER =
  "Loop coordinates work. It does not score, rank, or evaluate individuals.";

export type ReportSectionBody = { title: string; body: string };

export function assembleReportContent(input: {
  tenantId: string;
  mode?: string;
  projectSummaries: Array<{ name: string; progressPct: number; health: string; feverZone?: string }>;
  waitingTeamDays?: number;
  teamScopeUserIds: string[];
}): {
  tenantId: string;
  sections: ReportSectionBody[];
  footer: string;
  html: string;
  scopedUserCount: number;
} {
  const specs = reportSectionSpecs(input.mode ?? "mutual_adjustment", {
    surveyRespondents: 0,
    scope: "org",
  });
  const projectBody =
    input.projectSummaries
      .map(
        (p) =>
          `${p.name}: ${Math.round(p.progressPct)}% (${p.health})${
            p.feverZone ? ` · fever ${p.feverZone}` : ""
          }`,
      )
      .join("\n") || "No projects in scope.";

  const sections: ReportSectionBody[] = [
    {
      title: "Headline",
      body:
        input.waitingTeamDays != null
          ? `Waiting now: ${input.waitingTeamDays} team-days across open work.`
          : "Weekly coordination snapshot.",
    },
    { title: "Project health", body: projectBody },
    ...specs
      .filter((s) => s.key !== "headline" && s.key !== "project_health")
      .slice(0, 4)
      .map((s) => ({
        title: s.title,
        body: s.caption,
      })),
  ];

  const footer = `${REPORT_FOOTER}\n${REPORT_C1_DISCLAIMER}`;
  const html = [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Loop report</title>",
    "<style>body{font-family:Georgia,serif;color:#0E1F1A;max-width:720px;margin:2rem auto;padding:0 1rem}",
    "h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.5rem}pre{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:0.85rem}",
    "footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ccc;font-size:0.75rem;color:#5A6B7D}</style></head><body>",
    "<h1>Loop report</h1>",
    ...sections.map((s) => `<h2>${escapeHtml(s.title)}</h2><pre>${escapeHtml(s.body)}</pre>`),
    `<footer>${escapeHtml(footer)}</footer></body></html>`,
  ].join("");

  return {
    tenantId: input.tenantId,
    sections,
    footer,
    html,
    scopedUserCount: input.teamScopeUserIds.length,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderSectionsToPdf(
  sections: ReportSectionBody[],
  footer: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Loop report", { underline: false });
    doc.moveDown();
    for (const s of sections) {
      doc.fontSize(13).fillColor("#0E1F1A").text(s.title);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#333").text(s.body, { width: 500 });
      doc.moveDown();
    }
    doc.moveDown();
    doc.fontSize(8).fillColor("#5A6B7D").text(footer, { width: 500 });
    doc.end();
  });
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Persist PDF under REPORT_PDF_DIR or .data/reports. Returns relative pdf_ref. */
export function persistReportPdf(tenantId: string, reportId: string, pdf: Buffer): {
  pdfRef: string;
  pdfSha256: string;
} {
  const root =
    process.env.REPORT_PDF_DIR?.trim() ||
    join(process.cwd(), ".data", "reports");
  const dir = join(root, tenantId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${reportId}.pdf`);
  writeFileSync(file, pdf);
  const pdfSha256 = sha256Hex(pdf);
  // Prefer file:// for local; S3 upload can replace when S3_* is set.
  const pdfRef = process.env.S3_BUCKET
    ? `s3://${process.env.S3_BUCKET}/reports/${tenantId}/${reportId}.pdf`
    : `file://${file.replace(/\\/g, "/")}`;
  return { pdfRef, pdfSha256 };
}

export async function processWeeklyReportPdf(input: {
  tenantId: string;
  reportId: string;
  teamScopeUserIds: string[];
  projectSummaries: Array<{ name: string; progressPct: number; health: string; feverZone?: string }>;
  waitingTeamDays?: number;
  mode?: string;
}): Promise<{
  tenantId: string;
  reportId: string;
  sections: ReportSectionBody[];
  footer: string;
  html: string;
  pdfRef: string;
  pdfSha256: string;
  scopedUserCount: number;
}> {
  const assembled = assembleReportContent(input);
  const pdf = await renderSectionsToPdf(assembled.sections, assembled.footer);
  const stored = persistReportPdf(input.tenantId, input.reportId, pdf);
  return {
    tenantId: input.tenantId,
    reportId: input.reportId,
    sections: assembled.sections,
    footer: assembled.footer,
    html: assembled.html,
    pdfRef: stored.pdfRef,
    pdfSha256: stored.pdfSha256,
    scopedUserCount: assembled.scopedUserCount,
  };
}
