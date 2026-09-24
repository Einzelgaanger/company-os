// Tag audiences: who can see data carrying a tag.
//
// A tag is both a label and an access grant. Sensitivity answers "how guarded
// is this?"; the audience answers "which named people?". Both must pass, and
// when an item carries several tags the audiences intersect — adding a tag can
// only ever narrow who sees something, never widen it.

import {
  DEFAULT_TAG_AUDIENCE,
  ROLE_RANK,
  SENSITIVITY_RANK,
  clearanceFor,
  roleAtLeast,
  type Role,
  type Sensitivity,
  type Tag,
  type TagAudience,
  type User,
} from "./types";

export function audienceOf(tag: Tag): TagAudience {
  return { ...DEFAULT_TAG_AUDIENCE, ...(tag.audience ?? {}) };
}

/** Is this audience anything other than "the whole org"? */
export function isRestrictedAudience(tag: Tag): boolean {
  const a = audienceOf(tag);
  if (a.mode === "everyone") return false;
  if (a.mode === "role") return ROLE_RANK[a.min_role] > ROLE_RANK.member;
  return a.member_ids.length > 0;
}

/** Can this user see data carrying this one tag? */
export function tagAllows(tag: Tag, user: Pick<User, "id" | "role">): boolean {
  const a = audienceOf(tag);
  if (a.admin_override && roleAtLeast(user.role, "admin")) return true;
  switch (a.mode) {
    case "everyone":
      return true;
    case "only":
      return a.member_ids.includes(user.id);
    case "except":
      return !a.member_ids.includes(user.id);
    case "role":
      return roleAtLeast(user.role, a.min_role);
  }
}

/**
 * Can this user see an item carrying all of `tagIds`? Unknown tag ids are
 * ignored rather than denied, so deleting a tag can't strand its data.
 */
export function tagsAllow(
  tagIds: string[] | undefined | null,
  allTags: Tag[],
  user: Pick<User, "id" | "role">,
): boolean {
  if (!tagIds?.length) return true;
  const byId = new Map(allTags.map((t) => [t.id, t]));
  return tagIds.every((id) => {
    const tag = byId.get(id);
    return tag ? tagAllows(tag, user) : true;
  });
}

/** Tags on an item that are the reason a given user is locked out of it. */
export function blockingTags(
  tagIds: string[] | undefined | null,
  allTags: Tag[],
  user: Pick<User, "id" | "role">,
): Tag[] {
  if (!tagIds?.length) return [];
  const byId = new Map(allTags.map((t) => [t.id, t]));
  return tagIds
    .map((id) => byId.get(id))
    .filter((t): t is Tag => Boolean(t) && !tagAllows(t!, user));
}

/** Everyone in the org who can see data carrying this tag. */
export function audienceMembers(tag: Tag, users: User[]): User[] {
  return users.filter((u) => u.status !== "disabled" && tagAllows(tag, u));
}

const ROLE_PLURAL: Record<Role, string> = {
  owner: "Owners",
  admin: "Admins and owners",
  manager: "Managers and above",
  member: "Everyone",
};

/** One-line description of a tag's audience, for tables and chips. */
export function audienceSummary(tag: Tag, users: User[]): string {
  const a = audienceOf(tag);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.full_name ?? "Unknown member";
  const list = (ids: string[]) => {
    const names = ids.map(nameOf);
    if (names.length <= 2) return names.join(" and ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  };

  switch (a.mode) {
    case "everyone":
      return "Everyone in the org";
    case "role":
      return ROLE_PLURAL[a.min_role];
    case "only":
      if (a.member_ids.length === 0) return "Nobody yet — pick members";
      return `Only ${list(a.member_ids)}`;
    case "except":
      if (a.member_ids.length === 0) return "Everyone in the org";
      return `Everyone except ${list(a.member_ids)}`;
  }
}

/** How many people end up with access, for the "3 people" style count. */
export function audienceCount(tag: Tag, users: User[]): number {
  return audienceMembers(tag, users).length;
}

/** An item's labelling, as far as access control is concerned. */
export interface ItemLabel {
  sensitivity?: Sensitivity;
  tagIds?: string[] | null;
  ownerId?: string | null;
  requesterId?: string | null;
}

/**
 * The single access rule for a labelled item. Two gates, both of which must
 * pass: tag audience, then clearance. Owner and requester keep need-to-know on
 * clearance, but a tag audience still binds them — that is the point of a tag
 * whose audience is "only these 3 people".
 *
 * The data layer's `canAccess` delegates here so that the "who will see this"
 * preview shown while labelling cannot drift from what the reads enforce.
 */
export function itemAllows(
  item: ItemLabel,
  allTags: Tag[],
  user: Pick<User, "id" | "role">,
): boolean {
  if (!tagsAllow(item.tagIds, allTags, user)) return false;
  if (user.id === item.ownerId || user.id === item.requesterId) return true;
  return (
    SENSITIVITY_RANK[item.sensitivity ?? "internal"] <=
    SENSITIVITY_RANK[clearanceFor(user.role)]
  );
}

/** Everyone in the org who would still see an item labelled this way. */
export function whoCanSee(item: ItemLabel, allTags: Tag[], users: User[]): User[] {
  return users.filter((u) => u.status !== "disabled" && itemAllows(item, allTags, u));
}
