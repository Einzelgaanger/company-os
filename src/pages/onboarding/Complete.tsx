import { useNavigate } from "react-router-dom";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { LoopMotif } from "@/components/LoopMotif";
import { useAuth } from "@/context/AuthContext";

export default function OnbComplete() {
  const { completeOnboarding } = useAuth();
  const navigate = useNavigate();

  return (
    <OnboardingLayout step={4} title="You're set up" description="Loop is now watching your connected sources.">
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <LoopMotif size={200} />
        <p className="max-w-sm text-sm text-slate">
          From here, Loop detects commitments, tracks them, checks in on WhatsApp, escalates when things stall, and reports back to you.
        </p>
        <Button
          onClick={() => {
            completeOnboarding();
            navigate("/flow");
          }}
        >
          Go to Flow
        </Button>
      </div>
    </OnboardingLayout>
  );
}
