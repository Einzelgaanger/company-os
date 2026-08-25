import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured, type ApiComplianceRecord } from "@/lib/api";
import { fetchCompliance, NOTICE_VERSION } from "@/lib/legalRecords";

/**
 * Compliance attestation + publish updated notice (force re-ack).
 * Everything on this page is read from `tenant_compliance` over the API.
 */
export default function SettingsCompliance() {
  const { org } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<ApiComplianceRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchCompliance().then(setRecord);
  }, [org?.id]);

  const payload = (record?.payload ?? {}) as Record<string, unknown>;
  const noticeVer = String(payload.employeeNoticeVersion ?? NOTICE_VERSION);

  async function publish() {
    if (!apiConfigured()) {
      toast("Connect the API to publish a notice version.", "error");
      return;
    }
    setBusy(true);
    try {
      const next = `2026-08-v${Date.now().toString().slice(-4)}`;
      await api.publishNotice(next);
      setRecord(await fetchCompliance());
      toast("Notice published. Everyone must re-acknowledge on next visit.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not publish the notice.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compliance"
        subtitle="Onboarding attestation, DPIA status, and high-risk prohibition (C-1)."
      />
      <div className="portal-callout">
        <code className="font-mono text-xs">high_risk_use_prohibited = true</code> — cannot be disabled in the UI.
        Loop coordinates work items; it does not evaluate people.
      </div>
      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Attestation</h2>
            <p className="portal-section__desc">{org?.name ?? "Organization"}</p>
          </div>
        </header>
        <div className="portal-section__body--pad space-y-2 text-sm">
          {record?.attestedAt ? (
            <>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5A6B7D]">Attested at </span>
                {new Date(record.attestedAt).toLocaleString()}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5A6B7D]">Lawful basis </span>
                {record.lawfulBasis}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5A6B7D]">DPO </span>
                {String(payload.dpoEmail ?? "—")}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5A6B7D]">DPIA </span>
                {payload.dpiaCompleted ? "Completed" : "Not completed"}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5A6B7D]">Works council </span>
                {payload.worksCouncilRequired && !payload.worksCouncilConsulted
                  ? "Pending"
                  : "Consulted / not required"}
              </p>
              <p className="text-[11px] text-[#5A6B7D]">
                Templates:{" "}
                <a className="underline" href="/docs/compliance/dpia-template.md" target="_blank" rel="noreferrer">
                  DPIA
                </a>
                ,{" "}
                <a className="underline" href="/docs/compliance/lia-template.md" target="_blank" rel="noreferrer">
                  LIA
                </a>
                {" "}(repo docs/compliance/)
              </p>
            </>
          ) : (
            <p className="text-[11px] font-medium text-[#5A6B7D]">
              No attestation on file yet. Complete org onboarding compliance gate.
            </p>
          )}
        </div>
      </section>

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Employee notice</h2>
            <p className="portal-section__desc">Current version: {noticeVer}</p>
          </div>
        </header>
        <div className="portal-section__body--pad space-y-3">
          <p className="text-sm text-[#5A6B7D]">
            Publishing a new notice clears acknowledgements so every user must re-ack before using the app.
          </p>
          <Button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void publish()}
          >
            {busy ? "Publishing…" : "Publish updated notice"}
          </Button>
        </div>
      </section>
    </div>
  );
}
