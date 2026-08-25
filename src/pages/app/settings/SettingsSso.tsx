import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";

/** WorkOS SSO settings. */
export default function SettingsSso() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ configured: boolean; missing: string[] } | null>(null);

  useEffect(() => {
    if (!apiConfigured()) return;
    void api.ssoStatus().then(setStatus).catch(() => setStatus({ configured: false, missing: [] }));
  }, []);

  async function startSso() {
    try {
      const { authUrl } = await api.ssoAuthorize();
      window.location.href = authUrl;
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : "WorkOS is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID.",
        "error",
      );
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="SSO (WorkOS)"
        subtitle="Buy-not-build identity. Configure env credentials; Loop never fakes SSO success."
      />
      {!apiConfigured() ? (
        <p className="text-sm text-slate">Connect VITE_API_URL to manage SSO.</p>
      ) : (
        <>
          <p className="text-sm">
            Status:{" "}
            <span className="font-mono font-medium">
              {status?.configured ? "configured" : "not configured"}
            </span>
            {!status?.configured && status?.missing?.length
              ? ` — missing ${status.missing.join(", ")}`
              : null}
          </p>
          <Button onClick={() => void startSso()}>Start WorkOS SSO</Button>
        </>
      )}
    </div>
  );
}
