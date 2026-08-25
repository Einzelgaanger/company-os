import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { store } from "@/lib/store";

export default function AcceptInvite() {
  const { token } = useParams();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
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
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signUp({ email, password, fullName, inviteToken: token });
      navigate("/onboarding/profile");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not accept invite.", "error");
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card space-y-5">
        {valid === false ? (
          <>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#0E1F1A]">Invite not found</h2>
              <p className="mt-0.5 text-[11px] font-medium text-[#5A6B7D]">
                This invite link is invalid or has already been used.
              </p>
            </div>
            <Link to="/login" className="text-sm font-semibold text-[#0E1F1A] hover:underline">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#0E1F1A]">Join {orgName} on Loop</h2>
              <p className="mt-0.5 text-[11px] font-medium text-[#5A6B7D]">
                You've been invited. Set a password to activate your account.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="name" className="field-label">
                  Full name
                </label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="input-glass" />
              </div>
              <div>
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <Input id="email" type="email" value={email} readOnly className="input-glass opacity-70" />
              </div>
              <div>
                <label htmlFor="password" className="field-label">
                  Password
                </label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="input-glass" />
              </div>
              <Button type="submit" className="h-11 w-full min-h-[44px]">
                Accept invite
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
