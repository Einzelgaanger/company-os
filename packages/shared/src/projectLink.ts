/**
 * Project auto-linking — 04_INTEGRATIONS.md §4.6
 * Deterministic first; model only as fallback (caller supplies shortlist pick).
 */

export type LinkProject = {
  id: string;
  name: string;
  code: string | null;
  clientName: string | null;
  teamMemberUserIds: string[];
};

export type LinkMeeting = {
  title: string | null;
  participantUserIds: string[];
  externalParticipantDomains: string[];
};

export type LinkResult = {
  projectId: string | null;
  method: "code" | "participant_overlap" | "client_domain" | "model" | "none";
  confidence: number;
};

function domainFromClient(clientName: string | null): string | null {
  if (!clientName) return null;
  const m = clientName.match(/([a-z0-9-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Deterministic project link. Model fallback is NOT run here —
 * caller may call with modelPick after this returns none/low confidence.
 */
export function linkProjectDeterministic(meeting: LinkMeeting, projects: LinkProject[]): LinkResult {
  const title = (meeting.title ?? "").toLowerCase();

  // 1. Explicit code match — confidence 1.0
  for (const p of projects) {
    if (p.code && title.includes(p.code.toLowerCase())) {
      return { projectId: p.id, method: "code", confidence: 1 };
    }
  }

  // 2. Participant overlap ≥70% of internals in exactly one project's team — 0.8
  const internals = meeting.participantUserIds;
  if (internals.length > 0) {
    const hits: Array<{ id: string; overlap: number }> = [];
    for (const p of projects) {
      if (p.teamMemberUserIds.length === 0) continue;
      const overlap =
        internals.filter((u) => p.teamMemberUserIds.includes(u)).length / internals.length;
      if (overlap >= 0.7) hits.push({ id: p.id, overlap });
    }
    if (hits.length === 1) {
      return { projectId: hits[0].id, method: "participant_overlap", confidence: 0.8 };
    }
  }

  // 3. Client domain match — 0.7
  const domains = new Set(meeting.externalParticipantDomains.map((d) => d.toLowerCase()));
  const domainHits = projects.filter((p) => {
    const d = domainFromClient(p.clientName);
    return d && domains.has(d);
  });
  if (domainHits.length === 1) {
    return { projectId: domainHits[0].id, method: "client_domain", confidence: 0.7 };
  }

  return { projectId: null, method: "none", confidence: 0 };
}

/** Accept model shortlist pick only at ≥0.75 */
export function acceptModelProjectPick(
  projectId: string,
  confidence: number
): LinkResult | null {
  if (confidence < 0.75) return null;
  return { projectId, method: "model", confidence };
}
