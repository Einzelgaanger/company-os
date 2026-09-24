import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Mail, User } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthField } from "@/components/auth/AuthField";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { checkPassword } from "@/lib/passwordStrength";
import { isMockMode } from "@/lib/supabase";
import { store } from "@/lib/store";
import { acceptInviteAccount, peekInvite } from "@/lib/launch";

export default function AcceptInvite() {
  const { token } = useParams();
  const { signUp, signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setValid(false);
        return;
      }
      if (isMockMode) {
        const invited = store.all("users").find((u) => u.id === token && u.status === "invited");
        if (!invited) {
          setValid(false);
          return;
        }
        const org = store.all("organizations").find((o) => o.id === invited.org_id);
        setOrgName(org?.name ?? "your team");
        setEmail(invited.email);
        setFullName(invited.full_name);
        setValid(true);
        return;
      }
      const preview = await peekInvite(token);
      if (cancelled) return;
      if (!preview) {
        setValid(false);
        return;
      }
      setOrgName(preview.org_name);
      setEmail(preview.email);
      setFullName(preview.email.split("@")[0] ?? "");
      setValid(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!checkPassword(password).strong) {
      toast("Choose a strong password before joining.", "error");
      return;
    }
    try {
      if (isMockMode) {
        await signUp({ email, password, fullName, inviteToken: token });
      } else {
        const accepted = await acceptInviteAccount({ token, password, fullName });
        await signIn(accepted.email, password);
      }
      navigate("/onboarding/profile");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not accept invite.", "error");
    }
  }

  const strong = checkPassword(password).strong;

  return (
    <AuthLayout>
      {valid === false ? (
        <AuthCard
          title="Invite not found"
          description="This invite link is invalid or has already been used."
          footer={
            <Link to="/login" className="font-semibold text-ink hover:underline">
              Go to sign in
            </Link>
          }
        >
          <p className="text-sm text-slate">Ask your admin to send a new invite.</p>
        </AuthCard>
      ) : (
        <AuthCard
          title={`Join ${orgName ?? "your team"} on Company OS`}
          description="You've been invited. Set a strong password to activate your account."
        >
          <form onSubmit={submit} className="space-y-3">
            <AuthField
              id="name"
              label="Full name"
              icon={<User className="h-4 w-4" />}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <AuthField
              id="email"
              label="Email"
              icon={<Mail className="h-4 w-4" />}
              type="email"
              value={email}
              readOnly
            />
            <PasswordStrengthField value={password} onChange={setPassword} />
            <Button type="submit" className="h-11 w-full min-h-[44px]" disabled={!strong || valid !== true}>
              Accept invite
            </Button>
          </form>
        </AuthCard>
      )}
    </AuthLayout>
  );
}
