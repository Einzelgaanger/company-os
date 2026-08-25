// extract-commitments — DANI-quality extraction for Loop
// Meeting classify → confidence gate → source quote → assignee resolve → review queue
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { claude, extractJson } from "../_shared/anthropic.ts";

type Sensitivity = "public" | "internal" | "confidential" | "restricted";
type MeetingCategory = "catch_up" | "deal_origination" | "project_execution" | "follow_up" | "unknown";

interface ExtractedItem {
  title: string;
  description?: string;
  owner_name?: string;
  owner_email?: string;
  requested_by_name?: string;
  due_date?: string | null;
  priority_guess?: "low" | "medium" | "high" | "critical";
  sensitivity?: Sensitivity;
  tags?: string[];
  confidence_score?: number;
  needs_review?: boolean;
  source_quote?: string;
}

interface ExtractionResult {
  meeting_category: MeetingCategory;
  action_items: ExtractedItem[];
}

const REVIEW_THRESHOLD = 0.7;

const SYSTEM =
  "You extract commitments from meeting transcripts for an executive commitment tracker. " +
  "A commitment is a concrete thing someone owes someone else — not vague summaries. " +
  "Classify the meeting type first. Catch-up / coffee chats produce ZERO action items. " +
  "Return JSON only.";

const PROMPT = (text: string, participants: string) =>
  `Analyze this meeting transcript and return JSON shaped as:
{
  "meeting_category": "catch_up"|"deal_origination"|"project_execution"|"follow_up"|"unknown",
  "action_items": [
    {
      "title": string,
      "description": string,
      "owner_name": string,
      "owner_email": string|null,
      "requested_by_name": string,
      "due_date": "YYYY-MM-DD"|null,
      "priority_guess": "low"|"medium"|"high"|"critical",
      "sensitivity": "public"|"internal"|"confidential"|"restricted",
      "tags": string[],
      "confidence_score": number,
      "needs_review": boolean,
      "source_quote": string
    }
  ]
}

Rules:
- meeting_category: catch_up = social/relationship with no deliverables (return empty action_items).
  deal_origination = NDA/MOU/proposal. project_execution = deliverables. follow_up = status.
- Each action item must be specific (not "follow up on things").
- source_quote MUST be the exact sentence from the transcript that justifies the task.
- confidence_score 0-1. Set needs_review true if owner/deadline is ambiguous or quote is weak.
- Do not invent deadlines. If none stated, due_date null.
- Prefer owner_email when a participant email is known.
- Participants: ${participants || "unknown"}

TEXT:
${text}`;

function fuzzyScore(a: string, b: string): number {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const xt = new Set(x.split(/\s+/));
  const yt = y.split(/\s+/);
  const hits = yt.filter((t) => xt.has(t)).length;
  return hits / Math.max(xt.size, yt.length);
}

async function resolveTagIds(db: any, orgId: string, names: string[] = []): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    const { data: existing } = await db.from("tags").select("id").eq("org_id", orgId).eq("name", name).maybeSingle();
    if (existing) {
      ids.push(existing.id);
    } else {
      const { data: created } = await db
        .from("tags")
        .insert({ org_id: orgId, name, classification: "confidential" })
        .select("id")
        .single();
      if (created) ids.push(created.id);
    }
  }
  return ids;
}

/** Email → exact name → fuzzy name against org users + meeting participants. */
async function resolveUser(
  db: any,
  orgId: string,
  name?: string,
  email?: string,
  participantEmails: Map<string, string> = new Map()
): Promise<string | null> {
  if (email) {
    const { data } = await db.from("users").select("id").eq("org_id", orgId).ilike("email", email).maybeSingle();
    if (data) return data.id;
    const fromPart = participantEmails.get(email.toLowerCase());
    if (fromPart) return fromPart;
  }
  if (!name) return null;
  const { data: users } = await db.from("users").select("id, full_name, email").eq("org_id", orgId);
  let best: { id: string; score: number } | null = null;
  for (const u of users ?? []) {
    const score = Math.max(fuzzyScore(u.full_name ?? "", name), email ? fuzzyScore(u.email ?? "", email) : 0);
    if (score >= 0.85 && (!best || score > best.score)) best = { id: u.id, score };
  }
  return best?.id ?? null;
}

function gateReview(it: ExtractedItem): boolean {
  if (it.needs_review) return true;
  const conf = typeof it.confidence_score === "number" ? it.confidence_score : 0;
  if (conf < REVIEW_THRESHOLD) return true;
  if (!it.source_quote || it.source_quote.trim().length < 8) return true;
  if (!it.title || it.title.trim().length < 6) return true;
  if (/follow up on (things|it|this|that)/i.test(it.title)) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { org_id, text, source_type = "meeting", source_meeting_id = null } = body;
    if (!org_id || !text) return json({ error: "org_id and text required" }, 400);

    const db = adminClient();

    let participantsLabel = "";
    const participantEmailToUser = new Map<string, string>();
    if (source_meeting_id) {
      const { data: meeting } = await db.from("meetings").select("participants").eq("id", source_meeting_id).maybeSingle();
      const parts = (meeting?.participants ?? []) as { name?: string; email?: string; user_id?: string }[];
      participantsLabel = parts.map((p) => `${p.name ?? "?"}${p.email ? ` <${p.email}>` : ""}`).join(", ");
      for (const p of parts) {
        if (p.email && p.user_id) participantEmailToUser.set(p.email.toLowerCase(), p.user_id);
      }
    }

    let result: ExtractionResult;
    try {
      const out = await claude(SYSTEM, PROMPT(text, participantsLabel));
      result = extractJson<ExtractionResult>(out);
    } catch (_e) {
      try {
        const out = await claude(SYSTEM, PROMPT(text, participantsLabel));
        result = extractJson<ExtractionResult>(out);
      } catch (e2) {
        return json({ error: "extraction_failed", detail: String(e2) }, 502);
      }
    }

    const category: MeetingCategory = result.meeting_category ?? "unknown";
    if (source_meeting_id) {
      await db.from("meetings").update({ category }).eq("id", source_meeting_id);
    }

    if (category === "catch_up") {
      if (source_meeting_id) {
        await db
          .from("meetings")
          .update({ processed_at: new Date().toISOString(), extracted_commitments_count: 0 })
          .eq("id", source_meeting_id);
      }
      return json({ inserted: 0, ids: [], skipped: "catch_up", meeting_category: category });
    }

    const items = Array.isArray(result.action_items) ? result.action_items : [];
    const inserted: string[] = [];
    const reviewIds: string[] = [];

    for (const it of items) {
      if (!it.title?.trim()) continue;
      const owner_id = await resolveUser(db, org_id, it.owner_name, it.owner_email ?? undefined, participantEmailToUser);
      const requested_by_id = await resolveUser(db, org_id, it.requested_by_name);
      const tag_ids = await resolveTagIds(db, org_id, it.tags);
      const needs_review = gateReview(it) || !owner_id;
      const confidence =
        typeof it.confidence_score === "number"
          ? Math.max(0, Math.min(1, it.confidence_score))
          : needs_review
            ? 0.5
            : 0.8;

      const { data, error } = await db
        .from("commitments")
        .insert({
          org_id,
          title: it.title.trim(),
          description: it.description ?? null,
          owner_id,
          owner_external_name: owner_id ? null : it.owner_name ?? null,
          requested_by_id,
          source_type,
          source_meeting_id,
          due_date: it.due_date ?? null,
          priority: it.priority_guess ?? "medium",
          status: "open",
          sensitivity: it.sensitivity ?? "internal",
          tag_ids,
          classified_by: "system",
          confidence_score: confidence,
          needs_review,
          source_quote: it.source_quote ?? null,
        })
        .select("id")
        .single();

      if (!error && data) {
        inserted.push(data.id);
        if (needs_review) reviewIds.push(data.id);
        await db.from("commitment_status_history").insert({
          org_id,
          commitment_id: data.id,
          from_status: null,
          to_status: "open",
          channel: "system",
          note: needs_review ? "Extracted — queued for review" : "Extracted",
        });
      }
    }

    if (source_meeting_id) {
      await db
        .from("meetings")
        .update({ processed_at: new Date().toISOString(), extracted_commitments_count: inserted.length })
        .eq("id", source_meeting_id);
    }

    return json({
      inserted: inserted.length,
      ids: inserted,
      needs_review: reviewIds.length,
      review_ids: reviewIds,
      meeting_category: category,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
