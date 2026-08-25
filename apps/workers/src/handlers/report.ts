/** Weekly report tick — assembles sections; PDF via reportPdf when requested. */

export const REPORT_C1_DISCLAIMER =
  "Loop coordinates work. It does not score, rank, or evaluate individuals.";

export function processWeeklyReport(input: {
  tenantId: string;
  teamScopeUserIds: string[];
  projectSummaries: Array<{ name: string; progressPct: number; health: string }>;
}): {
  tenantId: string;
  sections: Array<{ title: string; body: string }>;
  footer: string;
  scopedUserCount: number;
} {
  return {
    tenantId: input.tenantId,
    scopedUserCount: input.teamScopeUserIds.length,
    sections: [
      {
        title: "Projects",
        body: input.projectSummaries
          .map((p) => `${p.name}: ${Math.round(p.progressPct)}% (${p.health})`)
          .join("\n") || "No projects in scope.",
      },
    ],
    footer: REPORT_C1_DISCLAIMER,
  };
}

export { processWeeklyReportPdf, assembleReportContent, renderSectionsToPdf } from "./reportPdf.js";
