import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";

/** ODPC / Meta / Twilio / OAuth / WorkOS readiness — never invents approvals. */
export default function SettingsLaunch() {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [odpcRef, setOdpcRef] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!apiConfigured()) {
      setData(null);
      return;
    }
    try {
      setData(await api.launchStatus());
    } catch {
      toast("Could not load launch status.", "error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveOdpc() {
    setBusy(true);
    try {
      await api.patchLaunch({ odpc_registration_ref: odpcRef });
      toast("ODPC reference saved.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!apiConfigured()) {
    return (
      <div className="space-y-2">
        <PageHeader title="Launch readiness" subtitle="Connect VITE_API_URL to see ODPC / Meta / Twilio status." />
      </div>
    );
  }

  const odpc = data?.odpc as { status?: string; registrationRef?: string | null; note?: string } | undefined;
  const meta = data?.meta as { businessVerified?: boolean; wabaIdConfigured?: boolean; note?: string } | undefined;
  const messaging = data?.messaging as {
    mode?: string;
    twilioConfigured?: boolean;
    liveReady?: boolean;
    note?: string | null;
  } | undefined;
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
          <p>META_WABA_ID in env: {meta?.wabaIdConfigured ? "set" : "missing"}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void api.patchLaunch({ meta_business_verified: true }).then(load)
            }
          >
            Mark Meta verified (after Meta confirms)
          </Button>
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Messaging / Twilio</h2>
          </div>
        </header>
        <div className="portal-section__body--pad text-sm space-y-1">
          <p>
            Mode: <span className="font-mono">{messaging?.mode}</span> · Twilio env:{" "}
            {messaging?.twilioConfigured ? "ok" : "incomplete"} · Live ready:{" "}
            {messaging?.liveReady ? "yes" : "no"}
          </p>
          {messaging?.note ? <p className="text-amber">{messaging.note}</p> : null}
          <div className="flex flex-wrap gap-2">
            {(["in_app", "sandbox", "live"] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant="outline"
                onClick={() => void api.patchLaunch({ messaging_mode: mode }).then(load)}
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
            Google Calendar: {oauth?.googleCalendar?.configured ? "configured" : `missing ${(oauth?.googleCalendar?.missing ?? []).join(", ")}`}
          </p>
          <p>
            Microsoft Calendar:{" "}
            {oauth?.microsoftCalendar?.configured
              ? "configured"
              : `missing ${(oauth?.microsoftCalendar?.missing ?? []).join(", ")}`}
          </p>
          <p>Token encryption: {oauth?.tokenEncryption ? "ok" : "set TOKEN_ENCRYPTION_KEY"}</p>
          <p>
            WorkOS: {workos?.configured ? "configured" : `missing ${(workos?.missing ?? []).join(", ")}`}
          </p>
        </div>
      </section>
    </div>
  );
}
