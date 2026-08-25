import type { Sensitivity } from "./types";

export interface Classification {
  sensitivity: Sensitivity;
  /** Lowercased tag names suggested for this content. */
  tags: string[];
  pii: boolean;
  rationale: string;
}

interface Rule {
  tag: string;
  sensitivity: Sensitivity;
  pii?: boolean;
  patterns: RegExp[];
}

// Heuristic taxonomy. In production the extract-commitments edge function runs
// the same classification via Claude for nuance; this keeps the in-app
// experience instant and deterministic.
const RULES: Rule[] = [
  {
    tag: "credentials",
    sensitivity: "restricted",
    patterns: [/\bpassword\b/i, /\bapi[\s-]?key\b/i, /\bsecret\b/i, /\btoken\b/i, /\bcredential/i],
  },
  {
    tag: "pii",
    sensitivity: "restricted",
    pii: true,
    patterns: [/\bpassport\b/i, /\bid number\b/i, /\bnational id\b/i, /\bssn\b/i, /\bdate of birth\b/i, /\bhome address\b/i, /\bphone number\b/i],
  },
  {
    tag: "hr",
    sensitivity: "restricted",
    pii: true,
    patterns: [/\bsalary\b/i, /\bpayroll\b/i, /\bcompensation\b/i, /\btermination\b/i, /\bperformance review\b/i, /\bhiring\b/i],
  },
  {
    tag: "financials",
    sensitivity: "confidential",
    patterns: [/\binvoice\b/i, /\brevenue\b/i, /\bbudget\b/i, /\bforecast\b/i, /\bpricing\b/i, /\bmargin\b/i, /\bcost\b/i],
  },
  {
    tag: "legal",
    sensitivity: "confidential",
    patterns: [/\bcontract\b/i, /\bnda\b/i, /\bagreement\b/i, /\blitigation\b/i, /\bcompliance\b/i],
  },
  {
    tag: "client data",
    sensitivity: "confidential",
    patterns: [/\bclient\b/i, /\bcustomer\b/i, /\bsharepoint\b/i, /\busage data\b/i, /\bexport\b/i, /\bdataset\b/i],
  },
  {
    tag: "engineering",
    sensitivity: "internal",
    patterns: [/\bapi\b/i, /\bspec\b/i, /\bdeploy/i, /\bendpoint\b/i, /\bschema\b/i, /\bmigration\b/i, /\brepo\b/i],
  },
];

export function classify(title: string, description?: string | null): Classification {
  const text = `${title} ${description ?? ""}`;
  const tags: string[] = [];
  let sensitivity: Sensitivity = "internal";
  let pii = false;
  const hits: string[] = [];

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      tags.push(rule.tag);
      hits.push(rule.tag);
      if (rankOf(rule.sensitivity) > rankOf(sensitivity)) sensitivity = rule.sensitivity;
      if (rule.pii) pii = true;
    }
  }

  const rationale = hits.length
    ? `Matched governance signals: ${hits.join(", ")}.`
    : "No sensitive signals detected; defaulted to internal.";

  return { sensitivity, tags, pii, rationale };
}

function rankOf(s: Sensitivity): number {
  return { public: 0, internal: 1, confidential: 2, restricted: 3 }[s];
}
