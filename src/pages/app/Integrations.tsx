import { useEffect, useMemo, useState } from "react";
import { Plug } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { isMockMode } from "@/lib/supabase";
import { api, apiConfigured } from "@/lib/api";
import { edgeFunctionsConfigured, oauthStartUrl } from "@/lib/launch";
import { PROVIDERS, type ProviderMeta } from "@/lib/providers";
import { roleAtLeast, type Connection } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { connectionHealthLocal } from "@/lib/connectionHealth";

function StatusPill({ status }: { status: Connection["status"] | "disconnected" }) {
  if (status === "connected") return <Badge variant="green">Connected</Badge>;
  if (status === "error") return <Badge variant="red">Error</Badge>;
  if (status === "expired") return <Badge variant="red">Reconnect needed</Badge>;
  return <Badge variant="outline">Disconnected</Badge>;
}

export default function Integrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [disconnectTarget, setDisconnectTarget] = useState<{ conn: Connection; meta: ProviderMeta } | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      setConnections(await db.listConnections(user.org_id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isAdmin = user ? roleAtLeast(user.role, "admin") : false;

  const findConn = (meta: ProviderMeta): Connection | undefined =>
    connections.find((c) => c.provider === meta.id && (meta.orgLevel ? c.user_id === null : c.user_id === user?.id || c.user_id === null));

  // Demo-store only: there is no provider OAuth client wired in, so this marks a
  // source connected against the seeded data rather than performing a handshake.
  async function connect(meta: ProviderMeta) {
    if (!user) return;
    if (apiConfigured()) {
      try {
        const res = await api.authorizeConnection(meta.id);
        window.location.href = res.authUrl;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "oauth_not_configured";
        toast(
          msg.includes("oauth_not_configured") || msg.includes("token_encryption")
            ? `OAuth not ready for ${meta.name}. Set provider client credentials and TOKEN_ENCRYPTION_KEY in .env.`
            : msg,
          "error",
        );
      }
      return;
    }
    if (edgeFunctionsConfigured()) {
      window.location.href = oauthStartUrl(meta.id, user.org_id, user.id);
      return;
    }
    if (!isMockMode) {
      toast(`${meta.name} OAuth is not configured for this deployment.`, "default");
      return;
    }
    await db.connectProvider(user.org_id, meta.orgLevel ? null : user.id, meta.id, user.email);
    toast(`${meta.name} connected in the demo store.`, "success");
    load();
  }

  async function doDisconnect() {
    if (!user || !disconnectTarget) return;
    await db.disconnectProvider(user.org_id, disconnectTarget.conn.id);
    toast(`${disconnectTarget.meta.name} disconnected.`, "default");
    setDisconnectTarget(null);
    load();
  }

  const personal = useMemo(() => PROVIDERS.filter((p) => !p.orgLevel), []);
  const orgLevel = useMemo(() => PROVIDERS.filter((p) => p.orgLevel), []);

  if (!user) return null;

  function Grid({ metas }: { metas: ProviderMeta[] }) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metas.map((meta) => {
          const conn = findConn(meta);
          const status = conn?.status ?? "disconnected";
          const connected = status === "connected";
          const needsReconnect = status === "expired" || status === "error";
          const health = connectionHealthLocal(status, conn?.last_synced_at ?? null);
          return (
            <Card key={meta.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <span className="rounded-md bg-secondary p-2">
                    <Plug className="h-4 w-4 text-slate" />
                  </span>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill status={status} />
                    {health.alert && (
                      <Badge variant="outline">Needs attention</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-ink">{meta.name}</div>
                  <div className="text-xs text-slate">{meta.category} · {meta.scopesNote}</div>
                </div>
                {conn?.external_account_email && connected && (
                  <div className="text-xs text-slate">
                    Connected as {conn.external_account_email}
                    {conn.last_synced_at && <> · synced {timeAgo(conn.last_synced_at)}</>}
                    {health.hoursSinceSync != null && (
                      <> · {health.hoursSinceSync.toFixed(1)}h since sync</>
                    )}
                  </div>
                )}
                {health.alert && status === "connected" && (
                  <p className="text-[11px] text-amber">
                    Sync older than 6 hours — reconnect or wait for the next calendar sync.
                  </p>
                )}
                <div className="flex gap-2">
                  {connected ? (
                    <Button variant="outline" size="sm" onClick={() => setDisconnectTarget({ conn: conn!, meta })}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className={needsReconnect ? "bg-red hover:bg-red/90" : undefined}
                      onClick={() => void connect(meta)}
                    >
                      {needsReconnect ? "Reconnect" : isMockMode && !apiConfigured() && !edgeFunctionsConfigured() ? "Connect (demo)" : "Connect"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader title="Integrations" description="Loop reads from these sources. Read-only access only." />

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-slate">Your connections</h2>
            <Grid metas={personal} />
          </div>
          {isAdmin && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-slate">Organization connections</h2>
              <Grid metas={orgLevel} />
            </div>
          )}
        </div>
      )}

      <Dialog open={!!disconnectTarget} onOpenChange={(o) => !o && setDisconnectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {disconnectTarget?.meta.name}?</DialogTitle>
            <DialogDescription>
              Loop will stop reading new data from this source. Existing tracked commitments won't be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisconnectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDisconnect}>Disconnect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
