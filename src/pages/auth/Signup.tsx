import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";

export default function Signup() {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUp({ email, password, fullName });
      navigate("/onboarding/organization");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create account.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card space-y-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#0E1F1A]">Create your account</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#5A6B7D]">
            Set up {BRAND.name} for your team in a few minutes.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="name" className="field-label">
              Full name
            </label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" className="input-glass" />
          </div>
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="input-glass" />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className="input-glass" />
          </div>
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}
          <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-[#5A6B7D]">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-[#0E1F1A] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
