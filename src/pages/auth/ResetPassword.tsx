import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { checkPassword } from "@/lib/passwordStrength";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const strong = checkPassword(password).strong;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checkPassword(password).strong) {
      setError("Choose a strong password before saving.");
      return;
    }
    if (!supabase) {
      setError(
        "Password changes need the hosted auth backend. This build runs on the local demo store, so the password cannot be changed here.",
      );
      return;
    }
    setBusy(true);
    setError(null);
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
      <AuthCard
        title="Set a new password"
        description="Choose a strong password you don't use elsewhere."
        footer={
          <Link to="/login" className="font-semibold text-[#0E1F1A] hover:underline">
            Back to sign in
          </Link>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <PasswordStrengthField label="New password" value={password} onChange={setPassword} />
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}
          <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={busy || !strong}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
