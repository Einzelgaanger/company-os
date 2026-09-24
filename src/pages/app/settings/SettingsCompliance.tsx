import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured, type ApiComplianceRecord } from "@/lib/api";
import { db } from "@/lib/db";
import { fetchCompliance, NOTICE_VERSION } from "@/lib/legalRecords";

/**
 * Compliance attestation + publish updated notice (force re-ack).
 * Everything on this page is read from `tenant_compliance` over the API.
 */
export default function SettingsCompliance() {
  const { org, refresh } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<ApiComplianceRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchCompliance().then(setRecord);
  }, [org?.id]);

  const stored = org?.settings.compliance;
  const attestedAt = record?.attestedAt ?? stored?.attested_at ?? null;
  const lawfulBasis = record?.lawfulBasis ?? stored?.lawful_basis ?? null;
  const payload = (record?.payload ?? {}) as Record<string, unknown>;
  const dpo = String(payload.dpoEmail ?? stored?.dpo_email ?? "—");
  const dpia = payload.dpiaCompleted ?? stored?.dpia_completed;
  const noticeVer = String(payload.employeeNoticeVersion ?? stored?.employee_notice_version ?? NOTICE_VERSION);

  async function publish() {
    if (!org) return;
    setBusy(true);
    try {
      const next = `2026-08-v${Date.now().toString().slice(-4)}`;
      if (apiConfigured()) {
        await api.publishNotice(next);
        setRecord(await fetchCompliance());
      } else if (stored) {
        await db.updateOrg(org.id, {
          settings: {
            ...org.settings,
            compliance: { ...stored, employee_notice_version: next },
          },
        });
        const people = await db.listUsers(org.id);
        for (const person of people) {
          await db.updateUser(person.id, {
            notification_prefs: {
              ...person.notification_prefs,
              notice_acknowledged_at: null,
              notice_acknowledged_version: null,
            },
          });
        }
        await refresh();
      } else {
        toast("Attest first, from onboarding, before publishing a new notice.", "error");
        return;
      }
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
        Company OS coordinates work items; it does not evaluate people.
      </div>
      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Attestation</h2>
            <p className="portal-section__desc">{org?.name ?? "Organization"}</p>
          </div>
        </header>
        <div className="portal-section__body--pad space-y-2 text-sm">
          {attestedAt ? (
            <>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5B6560]">Attested at </span>
                {new Date(attestedAt).toLocaleString()}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5B6560]">Lawful basis </span>
                {lawfulBasis}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5B6560]">DPO </span>
                {dpo}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5B6560]">DPIA </span>
                {dpia ? "Completed" : "Not completed"}
              </p>
              <p>
                <span className="text-[10px] font-semibold uppercase text-[#5B6560]">Works council </span>
                {payload.worksCouncilRequired && !payload.worksCouncilConsulted
                  ? "Pending"
                  : "Consulted / not required"}
              </p>
              <p className="text-[11px] text-[#5B6560]">
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
            <p className="text-[11px] font-medium text-[#5B6560]">
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
          <p className="text-sm text-[#5B6560]">
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
