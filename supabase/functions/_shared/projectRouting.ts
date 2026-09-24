// Route inbound signal (a meeting, a calendar event, a chat dump) to a project.
//
// Every project carries a routing profile: its members, its client and any
// aliases, and keywords. Anything we ingest is scored against every profile so
// extracted commitments land on the right project without anyone tagging them.
//
// Cheap deterministic signals run first and usually settle it. The model is
// only consulted when the top two candidates are close, which keeps the cost
// proportional to genuine ambiguity.
// deno-lint-ignore-file no-explicit-any
import { claude, extractJson } from "./anthropic.ts";

export type MatchMethod = "calendar" | "participants" | "keyword" | "client" | "llm" | "manual" | "none";

export type ProjectProfile = {
  id: string;
  name: string;
  clientName: string | null;
  clientAliases: string[];
  keywords: string[];
  memberIds: string[];
  ownerId: string | null;
};

export type RoutingSignal = {
  title?: string | null;
  text?: string | null;
  participantUserIds?: string[];
  /** Set when the meeting came from a calendar event already tied to a project. */
  calendarProjectId?: string | null;
};

export type RoutingResult = {
  projectId: string | null;
  confidence: number;
  method: MatchMethod;
};

/** Below this we leave project_id null rather than guess. */
export const ROUTING_THRESHOLD = 0.45;
/** Candidates within this of the leader are treated as a tie. */
const TIE_MARGIN = 0.12;

export async function loadProjectProfiles(db: any, orgId: string): Promise<ProjectProfile[]> {
  const { data: projects } = await db
    .from("projects")
    .select("id, name, client_name, client_aliases, keywords, owner_id")
    .eq("org_id", orgId)
    .in("status", ["active", "on_hold"]);

  if (!projects?.length) return [];

  const { data: members } = await db
    .from("project_members")
    .select("project_id, user_id")
    .eq("org_id", orgId);

  const byProject = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = byProject.get(m.project_id) ?? [];
    list.push(m.user_id);
    byProject.set(m.project_id, list);
  }

  return projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    clientName: p.client_name ?? null,
    clientAliases: p.client_aliases ?? [],
    keywords: p.keywords ?? [],
    memberIds: byProject.get(p.id) ?? [],
    ownerId: p.owner_id ?? null,
  }));
}

function containsPhrase(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (n.length < 3) return false;
  return haystack.includes(n);
}

/**
 * Deterministic score in 0..1. Title matches count for more than body matches
 * because a transcript mentioning a client in passing is weak evidence, while a
 * meeting titled after the client is strong evidence.
 */
export function scoreProfile(
  profile: ProjectProfile,
  signal: RoutingSignal,
): { score: number; method: MatchMethod } {
  const title = (signal.title ?? "").toLowerCase();
  const body = (signal.text ?? "").slice(0, 8000).toLowerCase();

  let score = 0;
  let method: MatchMethod = "none";
  let best = 0;

  const claim = (points: number, m: MatchMethod) => {
    score += points;
    if (points > best) {
      best = points;
      method = m;
    }
  };

  if (containsPhrase(title, profile.name)) claim(0.5, "keyword");
  else if (containsPhrase(body, profile.name)) claim(0.18, "keyword");

  const clientTerms = [profile.clientName, ...profile.clientAliases].filter(Boolean) as string[];
  for (const term of clientTerms) {
    if (containsPhrase(title, term)) {
      claim(0.4, "client");
      break;
    }
    if (containsPhrase(body, term)) {
      claim(0.15, "client");
      break;
    }
  }

  let keywordHits = 0;
  let keywordPoints = 0;
  for (const kw of profile.keywords) {
    if (containsPhrase(title, kw)) {
      keywordPoints += 0.15;
      keywordHits++;
    } else if (containsPhrase(body, kw)) {
      keywordPoints += 0.06;
      keywordHits++;
    }
  }
  if (keywordHits) claim(Math.min(0.4, keywordPoints), "keyword");

  // Participant overlap is the most reliable signal when the project is staffed:
  // the people in the room are the people on the project.
  if (profile.memberIds.length && signal.participantUserIds?.length) {
    const present = new Set(signal.participantUserIds);
    const overlap = profile.memberIds.filter((id) => present.has(id)).length;
    if (overlap) {
      const coverage = overlap / profile.memberIds.length;
      const density = overlap / present.size;
      claim(Math.min(0.5, 0.25 * coverage + 0.25 * density + 0.1), "participants");
    }
  }

  return { score: Math.min(1, score), method };
}

export async function routeToProject(
  profiles: ProjectProfile[],
  signal: RoutingSignal,
): Promise<RoutingResult> {
  if (signal.calendarProjectId) {
    return { projectId: signal.calendarProjectId, confidence: 1, method: "calendar" };
  }
  if (!profiles.length) return { projectId: null, confidence: 0, method: "none" };

  const ranked = profiles
    .map((p) => ({ profile: p, ...scoreProfile(p, signal) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score < ROUTING_THRESHOLD) {
    return { projectId: null, confidence: top?.score ?? 0, method: "none" };
  }

  const runnerUp = ranked[1];
  const ambiguous = runnerUp && top.score - runnerUp.score < TIE_MARGIN;
  if (!ambiguous) {
    return { projectId: top.profile.id, confidence: top.score, method: top.method };
  }

  const shortlist = ranked.slice(0, 3);
  const picked = await llmTiebreak(shortlist.map((r) => r.profile), signal);
  if (picked) {
    const match = shortlist.find((r) => r.profile.id === picked);
    return { projectId: picked, confidence: Math.max(0.6, match?.score ?? 0.6), method: "llm" };
  }

  // Tie the model could not break: take the deterministic leader but report the
  // low confidence so the UI can flag it for a human.
  return { projectId: top.profile.id, confidence: top.score * 0.8, method: top.method };
}

async function llmTiebreak(candidates: ProjectProfile[], signal: RoutingSignal): Promise<string | null> {
  const options = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | name="${c.name}" | client="${c.clientName ?? "none"}" | keywords=${
          c.keywords.slice(0, 8).join(", ") || "none"
        }`,
    )
    .join("\n");

  try {
    const out = await claude(
      "You match meeting content to the correct project. Return JSON only.",
      `Which project does this content belong to? Return {"project_id": "<id>"} or {"project_id": null} if you cannot tell.

Projects:
${options}

Title: ${signal.title ?? "(none)"}

Content:
${(signal.text ?? "").slice(0, 4000)}`,
      200,
    );
    const parsed = extractJson<{ project_id: string | null }>(out);
    const id = parsed?.project_id;
    return candidates.some((c) => c.id === id) ? (id as string) : null;
  } catch {
    return null;
  }
}
