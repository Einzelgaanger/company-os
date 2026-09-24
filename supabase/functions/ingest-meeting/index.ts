// ingest-meeting (BUILD_SPEC 8.1)
// Webhook receiver for Fathom (and manual transcript upload). Idempotent on
// (org_id, source, external_id) via the unique constraint in the schema.
// deno-lint-ignore-file no-explicit-any
import { adminClient, json, corsHeaders } from "../_shared/supabase.ts";
import { loadProjectProfiles, routeToProject } from "../_shared/projectRouting.ts";
import { stampFromOrgRules } from "../_shared/ingestionLabel.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("authorization") ?? "";
  const internal = req.headers.get("x-loop-internal");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorized =
    (auth === `Bearer ${serviceKey}` && serviceKey.length > 0) ||
    internal === "fathom-webhook";
  if (!authorized) return json({ error: "unauthorized" }, 401);

  try {
    const payload = await req.json();
    const {
      org_id,
      source = "fathom",
      external_id,
      title,
      participants = [],
      transcript_text = "",
      transcript_url = null,
      recording_url = null,
      occurred_at = null,
    } = payload;

    if (!org_id) return json({ error: "org_id required" }, 400);
    const db = adminClient();

    // Idempotency: skip if we've already ingested this external_id.
    if (external_id) {
      const { data: existing } = await db
        .from("meetings")
        .select("id")
        .eq("org_id", org_id)
        .eq("source", source)
        .eq("external_id", external_id)
        .maybeSingle();
      if (existing) return json({ meeting_id: existing.id, deduped: true });
    }

    // Match participants to users by email.
    const resolved = [];
    for (const p of participants) {
      let user_id: string | null = null;
      if (p.email) {
        const { data } = await db.from("users").select("id").eq("org_id", org_id).ilike("email", p.email).maybeSingle();
        user_id = data?.id ?? null;
      }
      resolved.push({ user_id, name: p.name, email: p.email ?? null });
    }

    // Work out which project this meeting belongs to before extracting, so the
    // commitments it produces inherit the project instead of landing unassigned.
    let routing = { projectId: null as string | null, confidence: 0, method: "none" as string };
    try {
      const profiles = await loadProjectProfiles(db, org_id);
      const calendarProjectId = external_id
        ? (
            await db
              .from("calendar_events")
              .select("project_id")
              .eq("org_id", org_id)
              .eq("external_id", external_id)
              .maybeSingle()
          ).data?.project_id ?? null
        : null;
      routing = await routeToProject(profiles, {
        title,
        text: transcript_text,
        participantUserIds: resolved.map((p) => p.user_id).filter(Boolean) as string[],
        calendarProjectId,
      });
    } catch (_e) {
      // Routing is best-effort; an unrouted meeting is still worth ingesting.
    }

    // Hold the whole call. Org rules may suggest a floor, but nothing is
    // extracted or treated as live data until a person tags it for privacy.
    const suggested = await stampFromOrgRules(
      db,
      org_id,
      "meeting",
      `${title ?? ""}\n${transcript_text}`,
      null,
      { sensitivity: "internal", tag_ids: [] },
    );

    const { data: meeting, error } = await db
      .from("meetings")
      .insert({
        org_id,
        source,
        external_id,
        title,
        participants: resolved,
        transcript_url,
        recording_url,
        transcript_text: transcript_text || null,
        occurred_at,
        project_id: routing.projectId,
        project_match_confidence: routing.projectId ? routing.confidence : null,
        project_match_method: routing.method,
        sensitivity: suggested.sensitivity,
        tag_ids: [],
        privacy_held: true,
        classified_by: null,
        processed_at: null,
        extracted_commitments_count: 0,
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({
      meeting_id: meeting.id,
      held: true,
      project_id: routing.projectId,
      project_match_confidence: routing.confidence,
      project_match_method: routing.method,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
