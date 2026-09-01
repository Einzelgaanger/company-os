import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  edgeFunctionsConfigured,
  fetchLaunchStatus,
  patchLaunchSettings,
} from "@/lib/launch";

/** ODPC / Meta / Twilio / OAuth / WorkOS readiness — never invents approvals. */
export default function SettingsLaunch() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [odpcRef, setOdpcRef] = useState("");
  const [busy, setBusy] = useState(false);

  const useEdge = edgeFunctionsConfigured() && !apiConfigured();

  async function load() {
    if (!user) return;
    if (apiConfigured()) {
      try {
        setData(await api.launchStatus());
      } catch {
        toast("Could not load launch status.", "error");
      }
      return;
    }
    if (useEdge) {
      try {
        const status = await fetchLaunchStatus(user.org_id);
        setData(status);
      } catch {
        toast("Could not load launch status.", "error");
      }
      return;
    }
    setData(null);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function patchLaunch(patch: Record<string, unknown>) {
    if (!user) return;
    if (apiConfigured()) {
      await api.patchLaunch(patch);
      return;
    }
    if (useEdge) {
      await patchLaunchSettings(user.org_id, patch);
    }
  }

  async function saveOdpc() {
    setBusy(true);
    try {
      await patchLaunch({ odpc_registration_ref: odpcRef });
      toast("ODPC reference saved.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!apiConfigured() && !useEdge) {
    return (
      <div className="space-y-2">
        <PageHeader
          title="Launch readiness"
          subtitle="Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or VITE_API_URL) to see ODPC / Meta status."
        />
      </div>
    );
  }

  const odpc = data?.odpc as { status?: string; registrationRef?: string | null; note?: string } | undefined;
  const meta = data?.meta as {
    businessVerified?: boolean;
    wabaIdConfigured?: boolean;
    whatsappTokenConfigured?: boolean;
    note?: string;
  } | undefined;
  const messaging = data?.messaging as {
    mode?: string;
    twilioConfigured?: boolean;
    metaConfigured?: boolean;
    liveReady?: boolean;
    note?: string | null;
  } | undefined;
  const ai = data?.ai as { openRouterConfigured?: boolean; source?: string } | undefined;
  const oauth = data?.oauth as {
    googleCalendar?: { configured?: boolean; missing?: string[] };
    microsoftCalendar?: { configured?: boolean; missing?: string[] };
    tokenEncryption?: boolean;
  } | undefined;
  const workos = data?.workos as { configured?: boolean; missing?: string[] } | undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Launch readiness"
        subtitle="Evidence status only — Loop never marks ODPC or Meta as approved for you."
      />

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">AI (OpenRouter)</h2>
            <p className="portal-section__desc">
              Keys load from app_secrets in Postgres first, then Edge env.
            </p>
          </div>
        </header>
        <div className="portal-section__body--pad text-sm space-y-1">
          <p>
            OpenRouter: {ai?.openRouterConfigured ? "configured" : "missing"} · source:{" "}
            {ai?.source ?? "—"}
          </p>
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">ODPC</h2>
            <p className="portal-section__desc">{odpc?.note}</p>
          </div>
        </header>
        <div className="portal-section__body--pad space-y-2">
          <p className="text-sm">
            Status: <span className="font-mono font-medium">{odpc?.status ?? "—"}</span>
            {odpc?.registrationRef ? ` · ${odpc.registrationRef}` : ""}
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ODPC registration reference"
              value={odpcRef}
              onChange={(e) => setOdpcRef(e.target.value)}
            />
            <Button disabled={busy || !odpcRef.trim()} onClick={() => void saveOdpc()}>
              Save
            </Button>
          </div>
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Meta WhatsApp</h2>
            <p className="portal-section__desc">{meta?.note}</p>
          </div>
        </header>
        <div className="portal-section__body--pad text-sm space-y-1">
          <p>Business verified (manual): {meta?.businessVerified ? "yes" : "no"}</p>
          <p>WABA configured: {meta?.wabaIdConfigured ? "yes" : "no"}</p>
          <p>Access token: {meta?.whatsappTokenConfigured ? "yes" : "no"}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void patchLaunch({ meta_business_verified: true }).then(load)
            }
          >
            Mark Meta verified (after Meta confirms)
          </Button>
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Messaging</h2>
          </div>
        </header>
        <div className="portal-section__body--pad text-sm space-y-1">
          <p>
            Mode: <span className="font-mono">{messaging?.mode ?? "live"}</span> · Meta:{" "}
            {messaging?.metaConfigured ? "ok" : "incomplete"} · Twilio:{" "}
            {messaging?.twilioConfigured ? "ok" : "optional"} · Live ready:{" "}
            {messaging?.liveReady ? "yes" : "no"}
          </p>
          {messaging?.note ? <p className="text-amber">{messaging.note}</p> : null}
          <div className="flex flex-wrap gap-2">
            {(["in_app", "sandbox", "live"] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant="outline"
                onClick={() => void patchLaunch({ messaging_mode: mode }).then(load)}
              >
                Use {mode}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">OAuth + WorkOS</h2>
          </div>
        </header>
        <div className="portal-section__body--pad text-sm space-y-1">
          <p>
            Google Calendar:{" "}
            {oauth?.googleCalendar?.configured
              ? "configured"
              : `missing ${(oauth?.googleCalendar?.missing ?? []).join(", ")}`}
          </p>
          <p>
            Microsoft Calendar:{" "}
            {oauth?.microsoftCalendar?.configured
              ? "configured"
              : `missing ${(oauth?.microsoftCalendar?.missing ?? []).join(", ")}`}
          </p>
          <p>
            WorkOS:{" "}
            {workos?.configured
              ? "configured"
              : `missing ${(workos?.missing ?? []).join(", ")}`}
          </p>
        </div>
      </section>
    </div>
  );
}
