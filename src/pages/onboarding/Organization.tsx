import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { slugify } from "@/lib/utils";

export default function OnbOrganization() {
  const { user, org, createOrganization } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(org?.name ?? "");
  const [busy, setBusy] = useState(false);
  const alreadyHasOrg = Boolean(user?.org_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (alreadyHasOrg) {
      navigate("/onboarding/compliance");
      return;
    }
    setBusy(true);
    try {
      await createOrganization(name.trim());
      navigate("/onboarding/compliance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout
      step={0}
      title={alreadyHasOrg ? "Your organization" : "Create your organization"}
      description="This is the workspace Company OS watches over."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="orgname">Organization name</Label>
          <Input id="orgname" value={name} onChange={(e) => setName(e.target.value)} required placeholder="ProDG Studios" />
          {name && <p className="font-mono text-xs text-slate">companyos.app/{slugify(name)}</p>}
        </div>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : alreadyHasOrg ? "Continue" : "Create organization"}
        </Button>
      </form>
    </OnboardingLayout>
  );
}
