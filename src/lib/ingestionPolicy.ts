// Ingestion labelling: everything a connected app pulls in gets a classification
// before anyone reads it.
//
// The org sets a floor (default_classification — normally "internal"), then
// layers rules on top: "emails are confidential", "anything from
// @client-domain.com is confidential and tagged client data". Rules are
// evaluated fail-closed — the most restrictive match wins for sensitivity, and
// tags from every match are applied.

import {
  SENSITIVITY_RANK,
  type ConnectionProvider,
  type IngestionContentKind,
  type IngestionLabelRule,
  type Sensitivity,
} from "./types";

/** An item a connected source is handing over, before it is stored. */
export interface IngestedItem {
  provider: ConnectionProvider;
  kind: IngestionContentKind;
  /** Subject line, event title, meeting name, filename. */
  title?: string | null;
  /** Body, transcript excerpt, or description. */
  body?: string | null;
  /** Sender address for email/chat — drives `from_domain` rules. */
  from_address?: string | null;
}

export interface LabelDecision {
  sensitivity: Sensitivity;
  tag_ids: string[];
  matched_rule_ids: string[];
  /** Human-readable trail for the UI preview and the audit record. */
  rationale: string;
}

function domainOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  if (at === -1) return address.trim().toLowerCase().replace(/^@/, "") || null;
  return address.slice(at + 1).trim().toLowerCase() || null;
}

export function ruleMatches(rule: IngestionLabelRule, item: IngestedItem): boolean {
  if (!rule.enabled) return false;
  if (rule.provider && rule.provider !== item.provider) return false;
  if (rule.content_kind && rule.content_kind !== item.kind) return false;

  switch (rule.match_type) {
    case "all":
      return true;
    case "keyword": {
      const needle = rule.match_value?.trim().toLowerCase();
      if (!needle) return false;
      return `${item.title ?? ""} ${item.body ?? ""}`.toLowerCase().includes(needle);
    }
    case "from_domain": {
      const want = domainOf(rule.match_value);
      const got = domainOf(item.from_address);
      // Exact domain or a subdomain of it — "client.com" must not catch
      // "notclient.com".
      return Boolean(want && got && (got === want || got.endsWith(`.${want}`)));
    }
  }
}

/** Sort key: explicit order first, then most restrictive, for stable display. */
export function compareRules(a: IngestionLabelRule, b: IngestionLabelRule): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return SENSITIVITY_RANK[b.sensitivity] - SENSITIVITY_RANK[a.sensitivity];
}

/**
 * Decide the classification and tags for one incoming item. Runs identically in
 * the browser preview and on the ingestion path, so what an admin tests in
 * Governance is what the pipeline actually does.
 */
export function labelIngestedItem(
  item: IngestedItem,
  rules: IngestionLabelRule[],
  defaultClassification: Sensitivity = "internal",
): LabelDecision {
  const matched = rules.filter((r) => ruleMatches(r, item)).sort(compareRules);

  let sensitivity = defaultClassification;
  const tagIds = new Set<string>();
  const reasons: string[] = [];

  for (const rule of matched) {
    if (SENSITIVITY_RANK[rule.sensitivity] > SENSITIVITY_RANK[sensitivity]) {
      sensitivity = rule.sensitivity;
    }
    for (const id of rule.tag_ids) tagIds.add(id);
    reasons.push(rule.name);
  }

  return {
    sensitivity,
    tag_ids: [...tagIds],
    matched_rule_ids: matched.map((r) => r.id),
    rationale: reasons.length
      ? `${sensitivity} — matched ${reasons.join(", ")}.`
      : `${sensitivity} — org default, no rule matched.`,
  };
}

/** Plain-English restatement of a rule, for the rules list. */
export function describeRule(
  rule: IngestionLabelRule,
  providerName: (p: ConnectionProvider) => string,
  contentLabel: (k: IngestionContentKind) => string,
): string {
  const source = rule.provider ? providerName(rule.provider) : "any connected app";
  const kind = rule.content_kind ? contentLabel(rule.content_kind).toLowerCase() : "anything";
  const scope = `${kind} from ${source}`;
  switch (rule.match_type) {
    case "all":
      return `All ${scope}`;
    case "keyword":
      return `${scope} mentioning "${rule.match_value}"`;
    case "from_domain":
      return `${scope} sent from ${rule.match_value}`;
  }
}
