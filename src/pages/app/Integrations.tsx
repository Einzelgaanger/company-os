import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Copy, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { isMockMode } from "@/lib/supabase";
import { api, apiConfigured, type ApiConnectorCatalogItem } from "@/lib/api";
import { edgeFunctionsConfigured, oauthStartUrl } from "@/lib/launch";
import {
  PROVIDERS,
  activeCategories,
  type ProviderCategory,
  type ProviderMeta,
} from "@/lib/providers";
import { roleAtLeast, type Connection } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { connectionHealthLocal } from "@/lib/connectionHealth";

type CatalogMap = Record<string, ApiConnectorCatalogItem>;

function StatusPill({ status }: { status: Connection["status"] | "disconnected" }) {
  if (status === "connected") return <Badge variant="green">Connected</Badge>;
  if (status === "error") return <Badge variant="red">Error</Badge>;
  if (status === "expired") return <Badge variant="red">Reconnect needed</Badge>;
  return <Badge variant="outline">Not connected</Badge>;
}

const AUTH_LABEL: Record<ProviderMeta["auth"], string> = {
  oauth2: "OAuth",
  api_key: "API key",
  webhook: "Webhook",
};

function syncFailure(name: string, raw: string | null): string {
  if (raw?.includes("403")) {
    return `${name} signed in, then Google refused the read. Enable the ${name} API on the Google Cloud project for this app, then reconnect.`;
  }
  if (raw?.includes("401")) {
    return `${name} signed in, but the permission was rejected. Reconnect and accept the requested access.`;
  }
  return raw ? `${name} signed in, but the first sync failed.` : `${name} needs a reconnect.`;
}

export default function Integrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [catalog, setCatalog] = useState<CatalogMap>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCategory | "all">("all");
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    conn: Connection;
    meta: ProviderMeta;
  } | null>(null);
  const [keyTarget, setKeyTarget] = useState<ProviderMeta | null>(null);
  const [credential, setCredential] = useState("");
  const [instance, setInstance] = useState("");
  const [saving, setSaving] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{
    meta: ProviderMeta;
    url: string;
    secret: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      setConnections(await db.listConnections(user.org_id));
      if (apiConfigured()) {
        const res = await api.connectorCatalog();
        setCatalog(
          Object.fromEntries(res.items.map((item) => [item.id, item])) as CatalogMap,
        );
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // The OAuth callback lands back here with the outcome in the query string.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const failure = searchParams.get("error");
    if (!connected && !failure) return;
    const named =
      PROVIDERS.find((p) => p.id === (connected ?? searchParams.get("provider")))?.name ??
      "That app";
    if (connected) {
      const row = connections.find((c) => c.provider === connected);
      if (!row) return;
      if (row.status === "error") {
        toast(syncFailure(named, row.error_message), "error");
      } else {
        toast(`${named} connected.`, "success");
      }
    }
    if (failure) {
      const declined = failure === "access_denied" || failure === "consent_required";
      const unavailable =
        failure === "oauth_not_configured" || failure === "token_encryption_not_configured";
      toast(
        declined
          ? `${named} access was declined.`
          : unavailable
            ? `${named} isn't available to connect yet.`
            : failure === "invalid_state"
              ? "That connection expired. Click Connect again."
              : `Couldn't connect ${named}. Try again.`,
        "error",
      );
    }
    searchParams.delete("connected");
    searchParams.delete("error");
    searchParams.delete("provider");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, connections]);

  const isAdmin = user ? roleAtLeast(user.role, "admin") : false;

  const findConn = useCallback(
    (meta: ProviderMeta): Connection | undefined =>
      connections.find(
        (c) =>
          c.provider === meta.id &&
          (meta.orgLevel
            ? c.user_id === null
            : c.user_id === user?.id || c.user_id === null),
      ),
    [connections, user],
  );

  /** Demo store has no provider client, so it marks the source connected. */
  async function connectInDemoStore(meta: ProviderMeta) {
    if (!user) return;
    await db.connectProvider(
      user.org_id,
      meta.orgLevel ? null : user.id,
      meta.id,
      user.email,
    );
    toast(`${meta.name} connected in the demo store.`, "success");
    void load();
  }

  async function startOAuth(meta: ProviderMeta) {
    if (!user) return;
    // Live workspaces use the Supabase OAuth function. Clicking Connect leaves
    // for that provider's consent screen and returns here when it finishes.
    if (!isMockMode && edgeFunctionsConfigured()) {
      window.location.assign(oauthStartUrl(meta.id, user.org_id, user.id, "/integrations"));
      return;
    }
    if (apiConfigured()) {
      try {
        const res = await api.authorizeConnection(meta.id);
        window.location.assign(res.authUrl);
      } catch (e) {
        toast(e instanceof Error ? e.message : `Couldn't connect ${meta.name}.`, "error");
      }
      return;
    }
    if (isMockMode) return connectInDemoStore(meta);
    toast(`${meta.name} can't be connected from this browser.`, "error");
  }

  async function createWebhook(meta: ProviderMeta) {
    if (!apiConfigured()) {
      if (isMockMode) return connectInDemoStore(meta);
      toast(`${meta.name} needs the API to mint a webhook URL.`, "default");
      return;
    }
    try {
      const res = await api.createConnectionWebhook(meta.id);
      setWebhookResult({ meta, url: res.webhookUrl, secret: res.signingSecret });
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "webhook_failed", "error");
    }
  }

  function connect(meta: ProviderMeta) {
    if (meta.auth === "oauth2") return void startOAuth(meta);
    if (meta.auth === "webhook") return void createWebhook(meta);
    if (!apiConfigured()) {
      if (isMockMode) return void connectInDemoStore(meta);
      toast(`${meta.name} needs the API to store credentials.`, "default");
      return;
    }
    setCredential("");
    setInstance("");
    setKeyTarget(meta);
  }

  async function saveCredential() {
    if (!keyTarget) return;
    setSaving(true);
    try {
      await api.setConnectionCredential(keyTarget.id, {
        credential: credential.trim(),
        instance: instance.trim() || undefined,
      });
      toast(`${keyTarget.name} connected.`, "success");
      setKeyTarget(null);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "credential_rejected";
      toast(
        msg === "credential_rejected"
          ? `${keyTarget.name} rejected that credential.`
          : msg,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function doDisconnect() {
    if (!user || !disconnectTarget) return;
    if (apiConfigured()) {
      try {
        await api.disconnectConnection(disconnectTarget.conn.id);
      } catch {
        /* fall through to the local store so the UI cannot lie */
      }
    }
    await db.disconnectProvider(user.org_id, disconnectTarget.conn.id);
    toast(`${disconnectTarget.meta.name} disconnected.`, "default");
    setDisconnectTarget(null);
    void load();
  }

  const connectedCount = useMemo(
    () => PROVIDERS.filter((m) => findConn(m)?.status === "connected").length,
    [findConn],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PROVIDERS.filter((meta) => {
      if (category !== "all" && meta.category !== category) return false;
      if (onlyConnected && findConn(meta)?.status !== "connected") return false;
      if (!needle) return true;
      return (
        meta.name.toLowerCase().includes(needle) ||
        meta.category.toLowerCase().includes(needle) ||
        meta.reads.toLowerCase().includes(needle)
      );
    });
  }, [query, category, onlyConnected, findConn]);

  const grouped = useMemo(
    () =>
      activeCategories(visible).map((cat) => ({
        category: cat,
        metas: visible.filter((m) => m.category === cat),
      })),
    [visible],
  );

  if (!user) return null;

  function ConnectorCard({ meta }: { meta: ProviderMeta }) {
    const conn = findConn(meta);
    const status = conn?.status ?? "disconnected";
    const connected = status === "connected";
    const needsReconnect = status === "expired" || status === "error";
    const health = connectionHealthLocal(status, conn?.last_synced_at ?? null);
    const adminOnly = meta.orgLevel && !isAdmin;

    return (
      <div className="flex h-full flex-col gap-3 rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <ProviderIcon id={meta.id} name={meta.name} mark={meta.icon} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-[#0E1F1A]">
                {meta.name}
              </div>
              <div className="text-[11px] font-medium text-[#5B6560]">
                {AUTH_LABEL[meta.auth]} · {meta.orgLevel ? "Workspace" : "Personal"}
              </div>
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        <p className="text-[11px] font-medium leading-snug text-[#5B6560]">
          {meta.reads}
        </p>

        <div className="mt-auto space-y-2">
          {connected && conn?.external_account_email && (
            <div className="text-[11px] font-medium text-[#5B6560]">
              {conn.external_account_email}
              {conn.last_synced_at && <> · synced {timeAgo(conn.last_synced_at)}</>}
            </div>
          )}
          {needsReconnect && conn?.error_message && (
            <p className="text-[11px] font-medium text-red-700">
              {syncFailure(meta.name, conn.error_message)}
            </p>
          )}
          {connected && health.alert && (
            <p className="text-[11px] font-medium text-amber">
              No sync in over 6 hours — reconnect or wait for the next cycle.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisconnectTarget({ conn: conn!, meta })}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                variant={needsReconnect ? "destructive" : "default"}
                disabled={adminOnly}
                title={adminOnly ? "An admin connects workspace sources" : undefined}
                onClick={() => connect(meta)}
              >
                {needsReconnect
                  ? "Reconnect"
                  : meta.auth === "webhook"
                    ? "Create endpoint"
                    : meta.auth === "api_key"
                      ? "Add key"
                      : "Connect"}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Integrations"
        description="Company OS reads from these sources. Read-only access, every provider, always."
        actions={
          <Badge variant="lime">
            {connectedCount} of {PROVIDERS.length} connected
          </Badge>
        }
      />

      <div className="portal-toolbar">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5B6560]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations"
            aria-label="Search integrations"
            className="pl-8"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="portal-filter">
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ProviderCategory | "all")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {activeCategories().map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant={onlyConnected ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyConnected((v) => !v)}
          >
            {onlyConnected && <Check className="h-3.5 w-3.5" />} Connected only
          </Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No integrations match"
          description="Try a different category or clear the search."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setOnlyConnected(false);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        grouped.map(({ category: cat, metas }) => (
          <section key={cat} className="portal-section">
            <div className="portal-section__head">
              <div>
                <div className="portal-section__title">{cat}</div>
                <div className="portal-section__desc">
                  {metas.length} {metas.length === 1 ? "source" : "sources"}
                </div>
              </div>
            </div>
            <div className="portal-section__body--pad">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metas.map((meta) => (
                  <ConnectorCard key={meta.id} meta={meta} />
                ))}
              </div>
            </div>
          </section>
        ))
      )}

      <Dialog
        open={!!disconnectTarget}
        onOpenChange={(o) => !o && setDisconnectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {disconnectTarget?.meta.name}?</DialogTitle>
            <DialogDescription>
              Company OS stops reading new data from this source and clears its stored
              credentials. Commitments already tracked stay where they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisconnectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doDisconnect()}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!keyTarget} onOpenChange={(o) => !o && setKeyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {keyTarget?.name}</DialogTitle>
            <DialogDescription>
              {catalog[keyTarget?.id ?? ""]?.credentialHint ??
                "Paste the read-only credential from the provider."}{" "}
              It is encrypted before it is stored and is never shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="Credential"
              type="password"
              autoComplete="off"
              aria-label={`${keyTarget?.name ?? "Provider"} credential`}
            />
            <Input
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              placeholder="Account or workspace (optional)"
              aria-label="Account or workspace"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setKeyTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!credential.trim() || saving}
              onClick={() => void saveCredential()}
            >
              {saving ? "Checking…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!webhookResult} onOpenChange={(o) => !o && setWebhookResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{webhookResult?.meta.name} endpoint ready</DialogTitle>
            <DialogDescription>
              Paste both values into {webhookResult?.meta.name}. The signing secret is
              shown once — Company OS keeps only an encrypted copy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {[
              { label: "Endpoint URL", value: webhookResult?.url ?? "" },
              { label: "Signing secret", value: webhookResult?.secret ?? "" },
            ].map((field) => (
              <div key={field.label} className="space-y-1">
                <div className="text-[11px] font-semibold text-[#0E1F1A]">
                  {field.label}
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-soft px-2 py-1.5 font-mono text-[11px] text-[#0E1F1A]">
                    {field.value}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(field.value);
                      toast(`${field.label} copied.`, "success");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setWebhookResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
