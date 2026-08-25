import { describe, expect, it } from "vitest";
import { classifyReply } from "./classify.js";
import { processWeeklyReport, REPORT_C1_DISCLAIMER } from "./report.js";
import { retentionCutoffs } from "./retention.js";
import { processOutboundWhatsApp } from "./outboundWhatsapp.js";
import type { EligibilityContext } from "@loop/messaging";

describe("classifyReply", () => {
  it("classifies done/blocked", () => {
    expect(classifyReply("done").status).toBe("done");
    expect(classifyReply("blocked on license").status).toBe("blocked");
  });
});

describe("weekly report", () => {
  it("includes C-1 disclaimer footer", () => {
    const r = processWeeklyReport({
      tenantId: "t1",
      teamScopeUserIds: ["u1"],
      projectSummaries: [{ name: "A", progressPct: 40, health: "on_track" }],
    });
    expect(r.footer).toBe(REPORT_C1_DISCLAIMER);
    expect(r.footer).toMatch(/does not score/i);
  });
});

describe("retention", () => {
  it("computes cutoffs from months", () => {
    const c = retentionCutoffs(
      { messagesMonths: 12, transcriptsMonths: 6 },
      new Date("2026-08-24T00:00:00Z"),
    );
    expect(c.messagesBefore.startsWith("2025-08")).toBe(true);
    expect(c.transcriptsBefore.startsWith("2026-02")).toBe(true);
  });
});

describe("outbound whatsapp", () => {
  const okEligibility: EligibilityContext = {
    user: {
      status: "active",
      noticeAcknowledgedAt: "2026-01-01",
      whatsappOptInAt: "2026-01-01",
      whatsappOptOutAt: null,
      phoneVerifiedAt: "2026-01-01",
    },
    tenant: {
      timezone: "Africa/Nairobi",
      workDays: [1, 2, 3, 4, 5],
      quietHoursStart: "18:00",
      quietHoursEnd: "08:00",
      maxCheckinsPerPersonPerDay: 3,
    },
    commitment: { reviewRequired: false },
    checkinsSentToPersonToday: 0,
    messagedAboutCommitmentWithin24h: false,
    now: new Date("2026-08-24T07:00:00Z"),
  };

  it("queues for approval when manual approve on", async () => {
    const r = await processOutboundWhatsApp({
      templateKey: "checkin_general",
      eligibility: okEligibility,
    });
    expect(r.status).toBe("queued_for_approval");
  });

  it("reschedules when opted out", async () => {
    const r = await processOutboundWhatsApp({
      templateKey: "checkin_general",
      eligibility: {
        ...okEligibility,
        user: {
          ...okEligibility.user,
          whatsappOptOutAt: "2026-08-24",
        },
      },
    });
    expect(r.status).toBe("reschedule");
  });

  it("fails loudly in live mode without Twilio", async () => {
    const prev = process.env.FEATURE_WHATSAPP_MANUAL_APPROVE;
    process.env.FEATURE_WHATSAPP_MANUAL_APPROVE = "false";
    try {
      const r = await processOutboundWhatsApp({
        templateKey: "checkin_evidence",
        eligibility: okEligibility,
        messagingMode: "live",
        toE164: "+254700000000",
      });
      expect(r.status).toBe("failed");
      if (r.status === "failed") expect(r.reason).toMatch(/twilio_not_configured/);
    } finally {
      if (prev === undefined) delete process.env.FEATURE_WHATSAPP_MANUAL_APPROVE;
      else process.env.FEATURE_WHATSAPP_MANUAL_APPROVE = prev;
    }
  });
});