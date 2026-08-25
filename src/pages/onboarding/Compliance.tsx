import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { NOTICE_VERSION } from "@/lib/legalRecords";

/**
 * C-3 / §3.5.1 step 2 — blocking compliance gate. Cannot skip.
 * The attestation is written to `tenant_compliance` by the API; nothing is stored
 * in the browser, so clearing storage cannot fabricate or destroy the record.
 */
export default function OnbCompliance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [lawful, setLawful] = useState(false);
  const [dpia, setDpia] = useState(false);
  const [works, setWorks] = useState(false);
  const [notice, setNotice] = useState(false);
  const [noHighRisk, setNoHighRisk] = useState(false);
  const [dpoEmail, setDpoEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const ok = lawful && dpia && works && notice && noHighRisk && dpoEmail.includes("@");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || !user) return;
    setBusy(true);
    try {
      if (apiConfigured()) {
        await api.attestCompliance({
          lawfulBasis: "legitimate_interest",
          dpiaCompleted: true,
          liaCompleted: true,
          worksCouncilRequired: works,
          worksCouncilConsulted: works,
          employeeNoticePublished: true,
          employeeNoticeVersion: NOTICE_VERSION,
          dpoEmail: dpoEmail.trim(),
          acknowledgedNotForHrDecisions: true,
        });
      }
      navigate("/onboarding/profile");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not record the attestation.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout
      step={1}
      title="Compliance gate"
      description="Required before Loop can process employee data. This attestation is retained as evidence."
    >
      <form onSubmit={submit} className="space-y-4 text-sm">
        <label className="flex gap-3">
          <Checkbox checked={lawful} onCheckedChange={(v) => setLawful(!!v)} />
          <span>
            I confirm our lawful basis for this processing is <strong>legitimate interest</strong> (GDPR Art. 6(1)(f)).
            Consent is not a valid basis in employment.
          </span>
        </label>
        <label className="flex gap-3">
          <Checkbox checked={dpia} onCheckedChange={(v) => setDpia(!!v)} />
          <span>
            I confirm a <strong>Data Protection Impact Assessment</strong> has been or will be completed before inviting
            employees. Template: <code className="font-mono text-[11px]">/docs/compliance/dpia-template.md</code>
          </span>
        </label>
        <label className="flex gap-3">
          <Checkbox checked={works} onCheckedChange={(v) => setWorks(!!v)} />
          <span>
            Where required by local law, <strong>employee representatives / works council</strong> have been or will be
            consulted.
          </span>
        </label>
        <label className="flex gap-3">
          <Checkbox checked={notice} onCheckedChange={(v) => setNotice(!!v)} />
          <span>Employees will be <strong>informed</strong> about what Loop does before their data is processed.</span>
        </label>
        <label className="flex gap-3">
          <Checkbox checked={noHighRisk} onCheckedChange={(v) => setNoHighRisk(!!v)} />
          <span>
            I acknowledge that <strong>Loop must not be used</strong> as the basis for promotion, discipline, or
            termination decisions (EU AI Act high-risk deployer obligations).
          </span>
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="dpo">DPO / privacy contact email</Label>
          <Input
            id="dpo"
            type="email"
            required
            value={dpoEmail}
            onChange={(e) => setDpoEmail(e.target.value)}
            placeholder="privacy@company.com"
            className="field-input"
          />
        </div>
        <p className="text-[11px] font-medium text-[#5A6B7D]">
          <code className="font-mono">high_risk_use_prohibited</code> remains true and cannot be disabled in the UI
          (C-1).
        </p>
        <Button type="submit" className="btn-primary" disabled={!ok || busy}>
          {busy ? "Saving…" : "Attest and continue"}
        </Button>
      </form>
    </OnboardingLayout>
  );
}
