import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { roleAtLeast, type Role } from "@/lib/types";
import { Logo } from "@/components/brand/Logo";
import { useLegalGates } from "@/lib/legalRecords";

function FullPageSpinner() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg">
      <Logo />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { user, isOnboarded, loading } = useAuth();
  const gates = useLegalGates(user);
  if (loading || gates.loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.org_id) return <Navigate to="/onboarding/organization" replace />;

  // A workspace that already finished setup is not sent back through the wizard.
  // Missing attestation stays visible under Settings → Compliance.
  if (isOnboarded) return <>{children}</>;

  if (!gates.complianceAttested && roleAtLeast(user.role, "admin")) {
    return <Navigate to="/onboarding/compliance" replace />;
  }

  // C-3: the org attestation in tenant_compliance must exist before any processing UI.
  if (!gates.complianceAttested) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <Logo />
        <p className="max-w-md text-sm font-medium text-ink">
          Your organization admin must complete the compliance attestation before Company OS can process work data.
        </p>
      </div>
    );
  }

  if (!gates.noticeAcknowledged) {
    return <Navigate to="/onboarding/notice" replace />;
  }

  if (!isOnboarded) return <Navigate to="/onboarding/profile" replace />;
  return <>{children}</>;
}

export function RequireRole({ min, children }: { min: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roleAtLeast(user.role, min)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <Logo />
        <h1 className="text-lg font-semibold text-ink">You don't have access to this page</h1>
        <p className="max-w-md text-sm text-slate">
          It is limited to {min}s and above. Your role is {user.role}.
        </p>
        <a href="/flow" className="text-sm font-semibold underline">
          Back to Flow
        </a>
      </div>
    );
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading, isOnboarded } = useAuth();
  const gates = useLegalGates(user);
  if (loading || gates.loading) return <FullPageSpinner />;
  if (user) {
    if (!user.org_id) return <Navigate to="/onboarding/organization" replace />;
    if (isOnboarded) return <Navigate to="/flow" replace />;
    if (!gates.complianceAttested && roleAtLeast(user.role, "admin")) {
      return <Navigate to="/onboarding/compliance" replace />;
    }
    if (!gates.noticeAcknowledged) return <Navigate to="/onboarding/notice" replace />;
    return <Navigate to="/onboarding/profile" replace />;
  }
  return <>{children}</>;
}
