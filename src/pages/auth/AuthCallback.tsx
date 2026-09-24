import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Logo } from "@/components/brand/Logo";
import { supabase } from "@/lib/supabase";

/**
 * OAuth return URL. Supabase Auth redirects here after Google (or other providers).
 * Add this path under Authentication → URL Configuration → Redirect URLs:
 *   http://localhost:5173/auth/callback
 *   https://os.jabali.studio/auth/callback
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    async function finish() {
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const oauthError = params.get("error_description") || params.get("error") || hashParams.get("error_description");
      if (oauthError) {
        setError(oauthError);
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      if (data.session) {
        // RedirectIfAuthed / RequireOnboarding pick the right next step.
        navigate("/flow", { replace: true });
        return;
      }

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        if (session) navigate("/flow", { replace: true });
      });

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setError("Sign-in timed out. Try again.");
      }, 10_000);

      return () => sub.subscription.unsubscribe();
    }

    let cleanupSub: (() => void) | undefined;
    void finish().then((cleanup) => {
      cleanupSub = cleanup;
    });

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      cleanupSub?.();
    };
  }, [navigate]);

  return (
    <AuthLayout>
      <div className="auth-card flex flex-col items-center gap-4 py-10 text-center">
        <Logo />
        {error ? (
          <>
            <p className="text-sm font-medium text-red-700">{error}</p>
            <Link to="/login" className="text-sm font-semibold text-[#0E1F1A] hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
            <p className="text-sm font-medium text-[#5B6560]">Finishing Google sign-in…</p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
