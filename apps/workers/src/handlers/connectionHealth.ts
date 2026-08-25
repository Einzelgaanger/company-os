import {
  connectionHealthFromSync,
  type ConnectionHealth,
} from "@loop/shared";

export type ConnectionSyncInput = {
  connectionId: string;
  provider: string;
  status: ConnectionHealth["status"];
  lastSyncedAt: string | null;
};

export function evaluateConnectionHealthBatch(
  connections: ConnectionSyncInput[],
  now = Date.now(),
): { alerts: ConnectionHealth[]; all: ConnectionHealth[] } {
  const all = connections.map((c) =>
    connectionHealthFromSync(
      c.connectionId,
      c.provider,
      c.status,
      c.lastSyncedAt,
      now,
    ),
  );
  return { all, alerts: all.filter((c) => c.alert) };
}
