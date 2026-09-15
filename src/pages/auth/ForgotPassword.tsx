import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthField } from "@/components/auth/AuthField";
import { Button } from "@/components/ui/button";
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
      <AuthCard
        title="Reset your password"
        description="We'll email you a link to set a new password."
        footer={
          <Link to="/login" className="font-semibold text-[#0E1F1A] hover:underline">
            Back to sign in
          </Link>
        }
      >
        {sent ? (
          <p className="text-sm font-medium text-[#5B6560]">
            If an account exists for <span className="font-semibold text-[#0E1F1A]">{email}</span>, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <AuthField
              id="email"
              label="Email"
              icon={<Mail className="h-4 w-4" />}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="text-xs font-medium text-red-700">{error}</p>}
            <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  );
}
