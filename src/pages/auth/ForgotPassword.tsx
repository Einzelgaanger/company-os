import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError(
        "Password recovery needs the hosted auth backend. This build runs on the local demo store, so no email can be sent.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthLayout>
      <div className="auth-card space-y-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#0E1F1A]">Reset your password</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#5A6B7D]">We'll email you a link to set a new password.</p>
        </div>
        {sent ? (
          <p className="text-sm font-medium text-[#5A6B7D]">
            If an account exists for <span className="font-semibold text-[#0E1F1A]">{email}</span>, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-glass" />
            </div>
            {error && <p className="text-xs font-medium text-red-700">{error}</p>}
            <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-[#5A6B7D]">
          <Link to="/login" className="font-semibold text-[#0E1F1A] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
