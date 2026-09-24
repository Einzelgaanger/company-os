// Org ingestion rules as a floor. Mirrors src/lib/ingestionPolicy.ts so an
// admin's Governance test bench is the same rule the pipeline stamps on write.
// Calls the SQL function `ingestion_label_for` from migration 0015.

type Sensitivity = "public" | "internal" | "confidential" | "restricted";

const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export function raiseSensitivity(a?: Sensitivity | null, b?: Sensitivity | null): Sensitivity {
  const left = a ?? "public";
  const right = b ?? "public";
  return SENSITIVITY_RANK[left] >= SENSITIVITY_RANK[right] ? left : right;
}

export function contentKindForSource(source: string | null | undefined): string | null {
  switch (source) {
    case "email":
      return "email";
    case "meeting":
    case "fathom":
    case "zoom":
    case "teams":
      return "meeting";
    case "whatsapp":
    case "telegram":
      return "chat_message";
    case "calendar":
      return "calendar_event";
    default:
      return null;
  }
}

export async function stampFromOrgRules(
  db: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
  orgId: string,
  sourceType: string,
  text: string,
  fromAddress: string | null,
  existing: { sensitivity?: Sensitivity | null; tag_ids: string[] },
): Promise<{ sensitivity: Sensitivity; tag_ids: string[] }> {
  try {
    const { data, error } = await db.rpc("ingestion_label_for", {
      p_org_id: orgId,
      p_provider: null,
      p_content_kind: contentKindForSource(sourceType),
      p_text: text,
      p_from_address: fromAddress,
    });
    if (error) return { sensitivity: existing.sensitivity ?? "internal", tag_ids: existing.tag_ids };
    const row = (Array.isArray(data) ? data[0] : data) as
      | { sensitivity?: Sensitivity; tag_ids?: unknown }
      | undefined;
    if (!row) return { sensitivity: existing.sensitivity ?? "internal", tag_ids: existing.tag_ids };
    const policyTags = Array.isArray(row.tag_ids) ? row.tag_ids.map(String) : [];
    return {
      sensitivity: raiseSensitivity(existing.sensitivity, row.sensitivity),
      tag_ids: [...new Set([...existing.tag_ids, ...policyTags])],
    };
  } catch {
    return { sensitivity: existing.sensitivity ?? "internal", tag_ids: existing.tag_ids };
  }
}
