import { describe, expect, it } from "vitest";
import {
  audienceCount,
  audienceSummary,
  blockingTags,
  itemAllows,
  tagAllows,
  tagsAllow,
  whoCanSee,
} from "./tagAccess";
import { DEFAULT_TAG_AUDIENCE, type Role, type Tag, type TagAudience, type User } from "./types";

function user(id: string, role: Role): User {
  return {
    id,
    org_id: "org",
    full_name: id,
    email: `${id}@example.com`,
    phone_number: null,
    phone_verified_at: null,
    role,
    manager_id: null,
    status: "active",
    avatar_url: null,
    notification_prefs: { whatsapp_checkins: false },
    created_at: "2026-01-01T00:00:00Z",
    last_active_at: null,
  };
}

function tag(id: string, audience: Partial<TagAudience>): Tag {
  return {
    id,
    org_id: "org",
    name: id,
    color: "teal",
    classification: "confidential",
    pii: false,
    description: null,
    audience: { ...DEFAULT_TAG_AUDIENCE, ...audience },
    created_at: "2026-01-01T00:00:00Z",
  };
}

const alfred = user("alfred", "owner");
const grace = user("grace", "admin");
const kayode = user("kayode", "manager");
const brian = user("brian", "member");
const amina = user("amina", "member");
const everyone = [alfred, grace, kayode, brian, amina];

describe("tagAllows", () => {
  it("admits the whole org by default", () => {
    const t = tag("general", {});
    expect(everyone.every((u) => tagAllows(t, u))).toBe(true);
  });

  it("admits only the named members in `only` mode", () => {
    const t = tag("financials", { mode: "only", member_ids: [kayode.id] });
    expect(tagAllows(t, kayode)).toBe(true);
    expect(tagAllows(t, brian)).toBe(false);
  });

  it("admits everyone but the named members in `except` mode", () => {
    const t = tag("credentials", { mode: "except", member_ids: [brian.id] });
    expect(tagAllows(t, brian)).toBe(false);
    expect(tagAllows(t, amina)).toBe(true);
  });

  it("admits at or above the floor in `role` mode", () => {
    const t = tag("legal", { mode: "role", min_role: "manager" });
    expect(tagAllows(t, kayode)).toBe(true);
    expect(tagAllows(t, brian)).toBe(false);
  });

  it("lets admins through when admin_override is on", () => {
    const t = tag("hr", { mode: "only", member_ids: [kayode.id] });
    expect(tagAllows(t, grace)).toBe(true);
    expect(tagAllows(t, alfred)).toBe(true);
  });

  it("holds against admins when admin_override is off", () => {
    const t = tag("hr-case", {
      mode: "only",
      member_ids: [kayode.id],
      admin_override: false,
    });
    expect(tagAllows(t, grace)).toBe(false);
    expect(tagAllows(t, alfred)).toBe(false);
    expect(tagAllows(t, kayode)).toBe(true);
  });
});

describe("tagsAllow", () => {
  const open = tag("open", {});
  const narrow = tag("narrow", { mode: "only", member_ids: [kayode.id], admin_override: false });

  it("is permissive when an item carries no tags", () => {
    expect(tagsAllow([], [open, narrow], brian)).toBe(true);
    expect(tagsAllow(undefined, [open, narrow], brian)).toBe(true);
  });

  it("intersects audiences — one narrow tag is enough to lock an item", () => {
    expect(tagsAllow([open.id, narrow.id], [open, narrow], brian)).toBe(false);
    expect(tagsAllow([open.id, narrow.id], [open, narrow], kayode)).toBe(true);
  });

  it("ignores tag ids that no longer exist rather than stranding data", () => {
    expect(tagsAllow(["deleted-tag"], [open], brian)).toBe(true);
  });

  it("names the tags responsible for a denial", () => {
    expect(blockingTags([open.id, narrow.id], [open, narrow], brian).map((t) => t.id)).toEqual([
      narrow.id,
    ]);
  });
});

describe("audience descriptions", () => {
  it("counts the people who end up with access", () => {
    const t = tag("financials", { mode: "only", member_ids: [kayode.id] });
    // The two admins keep break-glass access on top of the named member.
    expect(audienceCount(t, everyone)).toBe(3);
  });

  it("summarises each mode in plain language", () => {
    expect(audienceSummary(tag("a", {}), everyone)).toBe("Everyone in the org");
    expect(audienceSummary(tag("b", { mode: "only", member_ids: [brian.id] }), everyone)).toBe(
      "Only brian",
    );
    expect(audienceSummary(tag("c", { mode: "except", member_ids: [brian.id] }), everyone)).toBe(
      "Everyone except brian",
    );
    expect(audienceSummary(tag("d", { mode: "role", min_role: "manager" }), everyone)).toBe(
      "Managers and above",
    );
  });
});

describe("itemAllows / whoCanSee", () => {
  const hr = tag("hr", { mode: "only", member_ids: [grace.id], admin_override: false });

  it("lets the owner read past their own clearance", () => {
    expect(itemAllows({ sensitivity: "restricted" }, [], brian)).toBe(false);
    expect(itemAllows({ sensitivity: "restricted", ownerId: brian.id }, [], brian)).toBe(true);
  });

  it("still applies a tag audience to the owner", () => {
    expect(
      itemAllows({ sensitivity: "internal", tagIds: [hr.id], ownerId: brian.id }, [hr], brian),
    ).toBe(false);
  });

  it("previews the exact roster a labelling decision produces", () => {
    expect(whoCanSee({ sensitivity: "internal", tagIds: [hr.id] }, [hr], everyone)).toEqual([grace]);
  });

  it("reports nobody when clearance and audience cannot both be met", () => {
    // Only Brian passes the audience, and he cannot clear "restricted".
    const t = tag("t", { mode: "only", member_ids: [brian.id], admin_override: false });
    expect(whoCanSee({ sensitivity: "restricted", tagIds: [t.id] }, [t], everyone)).toEqual([]);
  });

  it("excludes deactivated people from the preview", () => {
    const gone = { ...amina, status: "disabled" as const };
    expect(whoCanSee({ sensitivity: "public" }, [], [brian, gone])).toEqual([brian]);
  });
});
