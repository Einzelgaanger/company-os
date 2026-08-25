import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { db } from "@/lib/db";
import { isMockMode, supabase } from "@/lib/supabase";
import { store, getStoredSession, setStoredSession } from "@/lib/store";
import { nowIso, slugify, uuid } from "@/lib/utils";
import type { Organization, User } from "@/lib/types";
import { api, apiConfigured, clearApiTokens, getAccessToken } from "@/lib/api";

const ONBOARD_PREFIX = "loop.onboarded.";

/** Demo / mock passwords — password-free login is forbidden outside DEV/test (A0). */
export const DEMO_PASSWORD = "LoopDemo2026!";

function allowPasswordFreeDemo(): boolean {
  if (import.meta.env.MODE === "test" || import.meta.env.VITEST) return true;
  return Boolean(import.meta.env.DEV);
}

interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  inviteToken?: string;
}

interface AuthContextValue {
  user: User | null;
  org: Organization | null;
  loading: boolean;
  isOnboarded: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** DEV/test only — production builds must use signIn with password. */
  signInDemo: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function onboardedFlag(userId: string): boolean {
  return localStorage.getItem(ONBOARD_PREFIX + userId) === "true";
}
function setOnboardedFlag(userId: string, value: boolean) {
  localStorage.setItem(ONBOARD_PREFIX + userId, String(value));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardTick, setOnboardTick] = useState(0);

  const loadUser = useCallback(async (userId: string | null, meta?: { email?: string; fullName?: string }) => {
    if (!userId) {
      setUser(null);
      setOrg(null);
      setLoading(false);
      return;
    }
    const u = await db.getUser(userId);
    if (u) {
      setUser(u);
      if (u.org_id) {
        const o = await db.getOrg(u.org_id);
        setOrg(o ?? null);
        if (u.phone_verified_at || onboardedFlag(u.id)) setOnboardedFlag(u.id, true);
      } else {
        setOrg(null);
      }
    } else {
      // Authenticated but not yet provisioned (pre-bootstrap / pre-invite-accept).
      setUser({
        id: userId,
        org_id: "",
        full_name: meta?.fullName || meta?.email?.split("@")[0] || "You",
        email: meta?.email || "",
        phone_number: null,
        phone_verified_at: null,
        role: "owner",
        manager_id: null,
        status: "active",
        avatar_url: null,
        notification_prefs: { whatsapp_checkins: true },
        created_at: nowIso(),
        last_active_at: nowIso(),
      });
      setOrg(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (apiConfigured()) {
      let cancelled = false;
      void (async () => {
        if (!getAccessToken()) {
          if (!cancelled) {
            setUser(null);
            setOrg(null);
            setLoading(false);
          }
          return;
        }
        try {
          const me = await api.me();
          if (cancelled) return;
          await loadUser(me.user.id);
          setOnboardedFlag(me.user.id, true);
        } catch {
          clearApiTokens();
          if (!cancelled) {
            setUser(null);
            setOrg(null);
            setLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (isMockMode) {
      const session = getStoredSession();
      void loadUser(session?.userId ?? null);
      return;
    }
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const u = data.session?.user;
      void loadUser(u?.id ?? null, {
        email: u?.email,
        fullName: (u?.user_metadata?.full_name as string | undefined) ?? undefined,
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      void loadUser(u?.id ?? null, {
        email: u?.email,
        fullName: (u?.user_metadata?.full_name as string | undefined) ?? undefined,
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadUser]);

  const refresh = useCallback(async () => {
    if (apiConfigured()) {
      const me = await api.me();
      await loadUser(me.user.id);
      return;
    }
    if (isMockMode) {
      const session = getStoredSession();
      await loadUser(session?.userId ?? null);
      return;
    }
    const { data } = await supabase!.auth.getSession();
    await loadUser(data.session?.user.id ?? null);
  }, [loadUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (apiConfigured()) {
        const res = await api.login(email, password);
        setOnboardedFlag(res.user.id, true);
        await loadUser(res.user.id);
        return;
      }
      if (isMockMode) {
        if (!password || password !== DEMO_PASSWORD) {
          throw new Error("Incorrect email or password.");
        }
        const match = store.all("users").find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!match) throw new Error("No account found for that email.");
        setStoredSession({ userId: match.id });
        if (match.org_id && match.phone_verified_at) {
          setOnboardedFlag(match.id, true);
        }
        await db.updateUser(match.id, { last_active_at: nowIso() });
        await loadUser(match.id);
        return;
      }
      const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      await db.updateUser(data.user.id, { last_active_at: nowIso() }).catch(() => undefined);
      await loadUser(data.user.id, {
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name as string | undefined,
      });
    },
    [loadUser]
  );

  const signInDemo = useCallback(async () => {
    if (!allowPasswordFreeDemo()) {
      throw new Error(
        "Password-free demo login is disabled. Sign in with alfred@prodg.studio and your password.",
      );
    }
    // DEV/test helper only — still uses the real demo password path.
    await signIn("alfred@prodg.studio", DEMO_PASSWORD);
  }, [signIn]);

  const signUp = useCallback(
    async ({ email, password, fullName, inviteToken }: SignUpInput) => {
      if (isMockMode) {
        if (inviteToken) {
          const invited = store.all("users").find((u) => u.id === inviteToken);
          if (!invited) throw new Error("This invite is no longer valid.");
          await db.updateUser(invited.id, { status: "active", full_name: fullName || invited.full_name });
          setStoredSession({ userId: invited.id });
          setOnboardedFlag(invited.id, false);
          await loadUser(invited.id);
          return;
        }
        const existing = store.all("users").find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (existing) throw new Error("An account with that email already exists.");
        const newUser: User = {
          id: uuid(),
          org_id: "",
          full_name: fullName,
          email,
          phone_number: null,
          phone_verified_at: null,
          role: "owner",
          manager_id: null,
          status: "active",
          avatar_url: null,
          notification_prefs: { whatsapp_checkins: true },
          created_at: nowIso(),
          last_active_at: nowIso(),
        };
        store.set("users", [...store.all("users"), newUser]);
        setStoredSession({ userId: newUser.id });
        setOnboardedFlag(newUser.id, false);
        await loadUser(newUser.id);
        return;
      }

      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Sign up failed — check email confirmation settings.");

      if (inviteToken) {
        await db.acceptInvite(inviteToken, fullName);
        setOnboardedFlag(data.user.id, false);
      } else {
        setOnboardedFlag(data.user.id, false);
      }
      await loadUser(data.user.id, { email, fullName });
    },
    [loadUser]
  );

  const createOrganization = useCallback(
    async (name: string) => {
      if (!user && !isMockMode) {
        const { data } = await supabase!.auth.getUser();
        if (!data.user) throw new Error("Not signed in.");
      }
      if (isMockMode) {
        if (!user) throw new Error("Not signed in.");
        const orgId = uuid();
        const newOrg: Organization = {
          id: orgId,
          name,
          slug: slugify(name) || orgId.slice(0, 8),
          plan: "pilot",
          settings: {
            report_frequency: "daily",
            timezone: "Africa/Nairobi",
            escalation_sla_hours: 24,
            data_retention_months: 12,
            report_channels: { email: true, in_app: true, whatsapp: false },
            report_recipient_ids: [user.id],
            autonomy_enabled: true,
            checkin_stale_hours: 48,
            nudge_after_hours: 24,
            default_classification: "internal",
            require_classification: true,
          },
          created_at: nowIso(),
        };
        store.set("organizations", [...store.all("organizations"), newOrg]);
        await db.updateUser(user.id, { org_id: orgId });
        await loadUser(user.id);
        return;
      }
      const fullName = user?.full_name;
      await db.bootstrapOrganization(name, fullName);
      const { data } = await supabase!.auth.getUser();
      await loadUser(data.user?.id ?? null);
    },
    [user, loadUser]
  );

  const signOut = useCallback(() => {
    if (apiConfigured()) {
      void api.logout().catch(() => undefined);
      clearApiTokens();
      setUser(null);
      setOrg(null);
      return;
    }
    if (isMockMode) {
      setStoredSession(null);
      setUser(null);
      setOrg(null);
      return;
    }
    void supabase!.auth.signOut();
    setUser(null);
    setOrg(null);
  }, []);

  const completeOnboarding = useCallback(() => {
    if (user) {
      setOnboardedFlag(user.id, true);
      setOnboardTick((t) => t + 1);
    }
  }, [user]);

  const isOnboarded = useMemo(() => {
    void onboardTick;
    if (!user) return false;
    // Provisioned users with an org are treated as onboarded once they finish the wizard
    // or if they already have a verified phone (seeded demo).
    if (user.org_id && (onboardedFlag(user.id) || user.phone_verified_at)) return true;
    return onboardedFlag(user.id);
  }, [user, onboardTick]);

  const value: AuthContextValue = {
    user,
    org,
    loading,
    isOnboarded,
    signIn,
    signInDemo,
    signUp,
    signOut,
    refresh,
    createOrganization,
    completeOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
