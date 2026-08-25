import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plug } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { isMockMode } from "@/lib/supabase";
import { PROVIDERS } from "@/lib/providers";
import { roleAtLeast, type Connection, type ConnectionProvider } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function OnbConnections() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);

  const reload = () => {
    if (user?.org_id) void db.listConnections(user.org_id).then(setConnections);
  };
  useEffect(reload, [user]);

  const isConnected = (p: ConnectionProvider) =>
    connections.some((c) => c.provider === p && c.status === "connected");

  async function connect(p: ConnectionProvider) {
    if (!user) return;
    await db.connectProvider(user.org_id, user.id, p, user.email);
    reload();
  }

  function next() {
    if (user && roleAtLeast(user.role, "admin")) navigate("/onboarding/team");
    else navigate("/onboarding/complete");
  }

  return (
    <OnboardingLayout
      step={3}
      title="Connect your tools"
      description="Loop reads from these sources to detect commitments. Read-only access only."
      footer={
        <Button variant="ghost" onClick={next}>
          Skip for now
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => {
          const connected = isConnected(p.id);
          return (
            <button
              key={p.id}
              disabled={!isMockMode || connected}
              onClick={() => connect(p.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
                connected ? "border-green/40 bg-green/5" : "border-border",
                !connected && isMockMode && "hover:border-teal/50"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <Plug className="h-4 w-4 text-slate" />
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green">
                    <Check className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate">
                    {isMockMode ? "Connect (demo)" : "OAuth not configured"}
                  </span>
                )}
              </div>
              <div className="font-medium text-ink">{p.name}</div>
              <div className="text-xs text-slate">{p.category}</div>
            </button>
          );
        })}
      </div>
      {!isMockMode && (
        <p className="mt-4 text-xs text-slate">
          Provider OAuth is not configured for this deployment, so no source can be connected yet. Continue and
          connect them later from Integrations.
        </p>
      )}
      <div className="mt-6">
        <Button onClick={next}>Continue</Button>
      </div>
    </OnboardingLayout>
  );
}
