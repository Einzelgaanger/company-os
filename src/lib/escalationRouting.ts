import type { OwnershipMapEntry, User } from "./types";

/**
 * Who a commitment escalates to. Manual "Escalate now" and the autonomous
 * sweep both call this, so the two paths cannot disagree.
 *
 * A keyword hit on the title beats a tag-name match, because the ownership
 * map is written as keywords ("sharepoint", "vgg") rather than as tag ids.
 */
export function pickEscalationRecipient(
  commitment: { title: string; description?: string | null; tag_ids?: string[] },
  map: OwnershipMapEntry[],
  users: User[],
  tags: Array<{ id: string; name: string }>,
): User | undefined {
  const tagNames = new Set(
    (commitment.tag_ids ?? [])
      .map((id) => tags.find((t) => t.id === id)?.name.toLowerCase())
      .filter((name): name is string => Boolean(name)),
  );
  const haystack = `${commitment.title} ${commitment.description ?? ""}`.toLowerCase();

  const byKeyword = map.find((m) =>
    (m.keywords ?? []).some((k) => k.length > 0 && haystack.includes(k.toLowerCase())),
  );
  const byTag = map.find((m) => tagNames.has(m.category.toLowerCase()));
  const byDefault = map.find((m) => m.category.toLowerCase() === "default");
  const entry = byKeyword ?? byTag ?? byDefault ?? map[0];

  const active = (id: string | null | undefined) =>
    users.find((u) => u.id === id && u.status !== "disabled");
  return (
    active(entry?.primary_owner_id) ??
    active(entry?.backup_owner_id) ??
    users.find((u) => u.role === "owner" || u.role === "admin")
  );
}
