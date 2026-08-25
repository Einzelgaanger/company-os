import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { setApiTokens } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

/** SSO callback — stores WorkOS-issued tokens then enters the app. */
export default function LoginSso() {
  const [params] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const err = params.get("error");
    if (err) {
      toast(decodeURIComponent(err), "error");
      return;
    }
    const access = params.get("accessToken");
    const refresh = params.get("refreshToken");
    if (access && refresh) {
      setApiTokens(access, refresh);
      window.location.replace("/flow");
    }
  }, [params, toast]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate">
      Completing SSO…
    </div>
  );
}
