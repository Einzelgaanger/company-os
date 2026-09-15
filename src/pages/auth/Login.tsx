import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthField } from "@/components/auth/AuthField";
import { AuthLaunch } from "@/components/auth/AuthLaunch";
import { AuthDivider, GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";

export default function Login() {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const showDevPrefill = import.meta.env.DEV;

  const finishLaunch = useCallback(() => {
    navigate("/flow");
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      setLaunching(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not sign in.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {launching ? <AuthLaunch onDone={finishLaunch} /> : null}
      <AuthCard
        title={`Sign in to ${BRAND.name}`}
        description="Enter your workspace credentials to continue."
        footer={
          <p>
            New to {BRAND.name}?{" "}
            <Link to="/signup" className="font-semibold text-[#0E1F1A] hover:underline">
              Create an account
            </Link>
          </p>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <AuthField
            id="email"
            label="Email"
            icon={<Mail className="h-4 w-4" />}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <AuthField
            id="password"
            label="Password"
            icon={<Lock className="h-4 w-4" />}
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            labelAside={
              <Link
                to="/forgot-password"
                className="text-[11px] font-semibold text-[#0E1F1A] hover:underline"
              >
                Forgot password?
              </Link>
            }
            trailing={
              <button
                type="button"
                className="auth-field__toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}
          <Button type="submit" className="btn-primary h-11 w-full min-h-[44px]" disabled={busy || launching}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <AuthDivider />
        <GoogleOAuthButton label="Continue with Google" />

        {showDevPrefill ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy || launching}
            onClick={() => {
              setEmail("alfred@prodg.studio");
              setPassword("LoopDemo2026!");
            }}
          >
            Prefill ProDG demo credentials (dev)
          </Button>
        ) : null}
      </AuthCard>
    </AuthLayout>
  );
}
