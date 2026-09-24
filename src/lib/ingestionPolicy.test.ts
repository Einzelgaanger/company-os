import { describe, expect, it } from "vitest";
import { labelIngestedItem, ruleMatches } from "./ingestionPolicy";
import type { IngestionLabelRule } from "./types";

function rule(patch: Partial<IngestionLabelRule>): IngestionLabelRule {
  return {
    id: patch.id ?? "r",
    org_id: "org",
    name: patch.name ?? "rule",
    provider: null,
    content_kind: null,
    match_type: "all",
    match_value: null,
    sensitivity: "confidential",
    tag_ids: [],
    enabled: true,
    sort_order: 10,
    created_at: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

const emailIsConfidential = rule({
  id: "email",
  name: "Email is confidential",
  content_kind: "email",
  sensitivity: "confidential",
});

const payrollIsRestricted = rule({
  id: "payroll",
  name: "Payroll is restricted",
  match_type: "keyword",
  match_value: "payroll",
  sensitivity: "restricted",
  tag_ids: ["tag-hr"],
  sort_order: 30,
});

const clientDomain = rule({
  id: "client",
  name: "Client domain",
  content_kind: "email",
  match_type: "from_domain",
  match_value: "client.com",
  sensitivity: "confidential",
  tag_ids: ["tag-client"],
  sort_order: 20,
});

const rules = [emailIsConfidential, clientDomain, payrollIsRestricted];

describe("labelIngestedItem", () => {
  it("falls back to the org default when nothing matches", () => {
    const d = labelIngestedItem({ provider: "google_drive", kind: "file" }, rules, "internal");
    expect(d.sensitivity).toBe("internal");
    expect(d.tag_ids).toEqual([]);
    expect(d.matched_rule_ids).toEqual([]);
  });

  it("raises emails to confidential while everything else stays internal", () => {
    const email = labelIngestedItem({ provider: "gmail", kind: "email" }, rules, "internal");
    const event = labelIngestedItem(
      { provider: "google_calendar", kind: "calendar_event" },
      rules,
      "internal",
    );
    expect(email.sensitivity).toBe("confidential");
    expect(event.sensitivity).toBe("internal");
  });

  it("takes the most restrictive match and unions the tags", () => {
    const d = labelIngestedItem(
      {
        provider: "gmail",
        kind: "email",
        title: "Q3 payroll review",
        from_address: "finance@client.com",
      },
      rules,
      "internal",
    );
    expect(d.sensitivity).toBe("restricted");
    expect([...d.tag_ids].sort()).toEqual(["tag-client", "tag-hr"]);
    expect(d.matched_rule_ids).toHaveLength(3);
  });

  it("never downgrades below the org default", () => {
    const d = labelIngestedItem(
      { provider: "gmail", kind: "email" },
      [rule({ id: "public", sensitivity: "public" })],
      "internal",
    );
    expect(d.sensitivity).toBe("internal");
  });

  it("skips disabled rules", () => {
    const d = labelIngestedItem(
      { provider: "gmail", kind: "email" },
      [{ ...emailIsConfidential, enabled: false }],
      "internal",
    );
    expect(d.sensitivity).toBe("internal");
  });
});

describe("ruleMatches", () => {
  it("scopes a rule to one provider", () => {
    const driveOnly = rule({ provider: "google_drive", content_kind: "file" });
    expect(ruleMatches(driveOnly, { provider: "google_drive", kind: "file" })).toBe(true);
    expect(ruleMatches(driveOnly, { provider: "onedrive", kind: "file" })).toBe(false);
  });

  it("matches subdomains of a from_domain rule but not lookalikes", () => {
    const item = (from: string) => ({ provider: "gmail" as const, kind: "email" as const, from_address: from });
    expect(ruleMatches(clientDomain, item("a@mail.client.com"))).toBe(true);
    expect(ruleMatches(clientDomain, item("a@notclient.com"))).toBe(false);
  });

  it("searches title and body for keyword rules", () => {
    const item = { provider: "slack" as const, kind: "chat_message" as const, body: "the PAYROLL run" };
    expect(ruleMatches(payrollIsRestricted, item)).toBe(true);
  });
});
