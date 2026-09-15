import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, User } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthField } from "@/components/auth/AuthField";
import { AuthDivider, GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";
import { checkPassword } from "@/lib/passwordStrength";

export default function Signup() {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strong = checkPassword(password).strong;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checkPassword(password).strong) {
      setError("Choose a strong password before creating the account.");
      return;
    }
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
      <AuthCard
        title="Create your account"
        description={`Set up ${BRAND.name} for your team in a few minutes.`}
        footer={
          <p>
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-[#0E1F1A] hover:underline">
              Sign in
            </Link>
          </p>
        }
      >
        <GoogleOAuthButton label="Continue with Google" />
        <AuthDivider />

        <form onSubmit={submit} className="space-y-3">
          <AuthField
            id="name"
            label="Full name"
            icon={<User className="h-4 w-4" />}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
          />
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
          <PasswordStrengthField value={password} onChange={setPassword} />
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}
          <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={busy || !strong}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            By creating an account you agree to the{" "}
            <Link to="/terms-of-service" className="font-semibold text-[#0E1F1A] hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy-policy" className="font-semibold text-[#0E1F1A] hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
