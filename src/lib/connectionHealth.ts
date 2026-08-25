/** SPA helper mirroring @loop/shared connectionHealthFromSync (no Node barrel). */
export type ConnHealth = {
  alert: boolean;
  hoursSinceSync: number | null;
  status: string;
};

export function connectionHealthLocal(
  status: string,
  lastSyncedAt: string | null,
  now = Date.now(),
): ConnHealth {
  let hoursSinceSync: number | null = null;
  if (lastSyncedAt) {
    hoursSinceSync = (now - new Date(lastSyncedAt).getTime()) / 3_600_000;
  }
  const alert =
    status === "error" ||
    status === "expired" ||
    (status === "connected" &&
      (hoursSinceSync == null || hoursSinceSync > 6));
  return { alert, hoursSinceSync, status };
}
