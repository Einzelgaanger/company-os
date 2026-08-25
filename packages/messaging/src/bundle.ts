/**
 * Bundle same-day check-ins — Phase 3.
 */
export type BundleCandidate = {
  commitmentId: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
};

/**
 * Group commitments by due date for checkin_bundle template.
 * Returns groups with 2+ items; singles stay unbundled.
 */
export function bundleByDueDate(
  items: BundleCandidate[],
): { dueDate: string; items: BundleCandidate[] }[] {
  const map = new Map<string, BundleCandidate[]>();
  for (const item of items) {
    const list = map.get(item.dueDate) ?? [];
    list.push(item);
    map.set(item.dueDate, list);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([dueDate, list]) => ({ dueDate, items: list }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Format bundle body variable {{2}} — short titles joined. */
export function formatBundleTitles(items: BundleCandidate[], max = 5): string {
  const slice = items.slice(0, max);
  const titles = slice.map((i) => `*${i.title}*`).join(", ");
  const extra = items.length - slice.length;
  return extra > 0 ? `${titles} (+${extra} more)` : titles;
}
