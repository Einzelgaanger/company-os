import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthLaunch } from "@/components/auth/AuthLaunch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="auth-card space-y-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#0E1F1A]">Sign in to {BRAND.name}</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#5A6B7D]">{BRAND.tagline}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="input-glass"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="field-label mb-0">
                Password
              </label>
              <Link to="/forgot-password" className="text-[11px] font-semibold text-[#0E1F1A] hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-glass pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#5A6B7D] hover:text-[#0E1F1A]"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}
          <Button type="submit" className="btn-primary h-11 w-full min-h-[44px]" disabled={busy || launching}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

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

        <p className="text-center text-sm text-[#5A6B7D]">
          New to {BRAND.name}?{" "}
          <Link to="/signup" className="font-semibold text-[#0E1F1A] hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-center text-[11px] text-[#5A6B7D]">
          Demo: alfred@prodg.studio (password required)
        </p>
      </div>
    </AuthLayout>
  );
}
