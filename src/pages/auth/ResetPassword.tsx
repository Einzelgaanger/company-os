import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError(
        "Password changes need the hosted auth backend. This build runs on the local demo store, so the password cannot be changed here.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    // The recovery link puts a session on this client, so updateUser sets the password.
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await supabase.auth.signOut();
    toast("Password updated. Sign in with your new password.", "success");
    navigate("/login");
  }

  return (
    <AuthLayout>
      <div className="auth-card space-y-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#0E1F1A]">Set a new password</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#5A6B7D]">Choose a strong password you don't use elsewhere.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="password" className="field-label">
              New password
            </label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="input-glass" />
          </div>
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}
          <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </form>
        <p className="text-center text-sm text-[#5A6B7D]">
          <Link to="/login" className="font-semibold text-[#0E1F1A] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
