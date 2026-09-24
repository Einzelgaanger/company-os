import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { isMockMode } from "@/lib/supabase";
import { edgeFunctionsConfigured, oauthStartUrl } from "@/lib/launch";
import { CORE_PROVIDERS, PROVIDERS, type ProviderMeta } from "@/lib/providers";
import { roleAtLeast, type Connection } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function OnbConnections() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);

  const reload = () => {
    if (user?.org_id) void db.listConnections(user.org_id).then(setConnections);
  };
  useEffect(reload, [user]);

  const isConnected = (meta: ProviderMeta) =>
    connections.some((c) => c.provider === meta.id && c.status === "connected");

  async function connect(meta: ProviderMeta) {
    if (!user) return;
    await db.connectProvider(
      user.org_id,
      meta.orgLevel ? null : user.id,
      meta.id,
      user.email,
    );
    reload();
  }

  function next() {
    if (user && roleAtLeast(user.role, "admin")) navigate("/onboarding/team");
    else navigate("/onboarding/complete");
  }

  return (
    <OnboardingLayout
      step={4}
      title="Connect your tools"
      description="Connect opens that app's sign-in so Company OS can read it. Read-only access only."
      footer={
        <Button variant="ghost" onClick={next}>
          Skip for now
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CORE_PROVIDERS.map((meta) => {
          const connected = isConnected(meta);
          return (
            <button
              key={meta.id}
              disabled={connected}
              onClick={() => {
                if (!user) return;
                if (isMockMode) {
                  void connect(meta);
                  return;
                }
                if (meta.auth === "oauth2" && edgeFunctionsConfigured()) {
                  window.location.assign(oauthStartUrl(meta.id, user.org_id, user.id));
                  return;
                }
                navigate("/integrations");
              }}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                connected ? "border-green/40 bg-green/5" : "border-border",
                !connected && "hover:border-teal/50",
              )}
            >
              <ProviderIcon
                id={meta.id}
                name={meta.name}
                mark={meta.icon}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-ink">
                    {meta.name}
                  </span>
                  {connected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-green">
                      <Check className="h-3.5 w-3.5" /> Connected
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-slate">
                      Connect
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate">{meta.category}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate">
        {`These are the sources most workspaces start with. The other ${PROVIDERS.length - CORE_PROVIDERS.length} are on Integrations.`}
      </p>
      <div className="mt-6">
        <Button onClick={next}>Continue</Button>
      </div>
    </OnboardingLayout>
  );
}
