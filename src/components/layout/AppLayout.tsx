import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Waves,
  Hourglass,
  FolderKanban,
  ListChecks,
  ShieldQuestion,
  Users,
  AlertTriangle,
  FileText,
  Plug,
  Settings,
  ShieldCheck,
  Inbox,
  PanelLeftClose,
  PanelLeft,
  Bell,
  LogOut,
  Menu,
  X,
  MoreHorizontal,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AutonomyPill } from "@/components/AutonomyPill";
import { BrandMark } from "@/components/brand/LoopMark";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { connectionHealthLocal } from "@/lib/connectionHealth";
import { roleAtLeast, type Role } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  minRole?: Role;
  /** Bottom tab bar label, where the full one will not fit (08_PAGES §8.3). */
  short?: string;
}

/** Order fixed by 08_PAGES §8.3 — flow first, personal queue third. */
const NAV: NavItem[] = [
  { to: "/flow", label: "Flow", icon: Waves },
  { to: "/waiting", label: "Waiting", icon: Hourglass },
  { to: "/my-work", label: "My work", icon: Inbox, short: "My work" },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/commitments", label: "Commitments", icon: ListChecks },
  { to: "/review", label: "Review queue", icon: ShieldQuestion, minRole: "manager" },
  { to: "/team", label: "Team", icon: Users, minRole: "manager" },
  { to: "/escalations", label: "Escalations", icon: AlertTriangle },
  { to: "/reports", label: "Reports", icon: FileText, minRole: "manager" },
  { to: "/surveys", label: "Surveys", icon: BarChart3, minRole: "manager" },
  { to: "/governance", label: "Governance", icon: ShieldCheck, minRole: "manager" },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings/profile", label: "Settings", icon: Settings },
];

const BANNER_KEY = "loop.banner.whatsapp.dismissed";
const CONN_BANNER_KEY = "loop.banner.connection.dismissed";

export function AppLayout() {
  const { user, org, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem(BANNER_KEY) === "true"
  );
  const [connBannerDismissed, setConnBannerDismissed] = useState(
    () => localStorage.getItem(CONN_BANNER_KEY) === "true"
  );
  const [connAlert, setConnAlert] = useState<{ provider: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    void db.listNotifications(user.id).then((ns) => setUnread(ns.filter((n) => !n.read_at).length));
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user?.org_id) return;
    void db.listConnections(user.org_id).then((conns) => {
      const bad = conns.find((c) => connectionHealthLocal(c.status, c.last_synced_at).alert);
      setConnAlert(bad ? { provider: bad.provider } : null);
    });
  }, [user, location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen && !moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, moreOpen]);

  const items = useMemo(
    () => (user ? NAV.filter((n) => !n.minRole || roleAtLeast(user.role, n.minRole)) : []),
    [user]
  );
  // Flow · Waiting · My work · More (§8.3).
  const tabItems = items.slice(0, 3);
  const moreItems = items.slice(3);

  if (!user) return null;

  const showWhatsappBanner = !user.phone_verified_at && !bannerDismissed;
  const showConnBanner = Boolean(connAlert) && !connBannerDismissed;

  function NavList({ dense = false }: { dense?: boolean }) {
    return (
      <nav className={cn("flex-1 space-y-0.5 overflow-y-auto px-2 py-2", dense && "px-1")}>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn("sidebar-nav-link", isActive && "active", collapsed && !mobileOpen && "justify-center px-0")
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
            {(!collapsed || mobileOpen) && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
      <div className="portal-shell">
        {/* §12.6: ambient shell → solid #eef2ee veil → photo @ 0.12 on top */}
        <div className="portal-backdrop" aria-hidden>
          <div className="portal-backdrop__veil" />
          <img src={BRAND.portalBackdrop} alt="" className="portal-backdrop__photo" aria-hidden />
        </div>

        <aside className={cn("sidebar-glass hidden lg:flex", collapsed && "collapsed")}>
          <div className={cn("flex h-14 items-center gap-2.5 px-3", collapsed ? "justify-center" : "")}>
            <BrandMark className="h-8 w-8" />
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{BRAND.name}</div>
                <div className="truncate text-[10px] font-medium text-white/55">{org?.name ?? "Workspace"}</div>
              </div>
            )}
          </div>
          <div className="sidebar-divider" />
          <NavList />
          <div className="sidebar-divider" />
          {!collapsed && (
            <div className="m-2 flex items-center gap-2 rounded-xl bg-[#173028] px-2.5 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#D3F36B] text-[11px] font-bold text-[#0E1F1A]">
                {initials(user.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white">{user.full_name}</div>
                <div className="truncate text-[10px] text-white/50">{org?.name ?? user.role}</div>
              </div>
              <Link
                to="/notifications"
                className="relative touch-target flex items-center justify-center text-white/70 hover:text-white"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" strokeWidth={1.75} />
                {unread > 0 && (
                  <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#F0C419]" />
                )}
              </Link>
              <button
                type="button"
                className="touch-target flex items-center justify-center text-white/70 hover:text-white"
                aria-label="Sign out"
                onClick={() => {
                  signOut();
                  navigate("/login");
                }}
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 px-4 py-3 text-xs font-medium text-white/55 hover:text-white"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute bottom-0 left-0 top-0 flex w-[min(20rem,88vw)] flex-col bg-[#0E1F1A] text-[#E8F0EA] animate-fade-in safe-pad-x">
              <div className="flex h-14 items-center justify-between px-2">
                <span className="inline-flex items-center gap-2.5">
                  <BrandMark className="h-8 w-8" />
                  <span className="font-bold text-white">{BRAND.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="touch-target flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavList dense />
              <button
                type="button"
                onClick={() => {
                  signOut();
                  navigate("/login");
                }}
                className="m-3 flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </aside>
          </div>
        )}

        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="glass-nav flex h-14 items-center justify-between px-3 lg:hidden safe-pad-x safe-pad-top">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="touch-target flex items-center justify-center text-[#0E1F1A]"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#0E1F1A]">
              <BrandMark className="h-7 w-7" />
              {BRAND.name}
            </span>
            <Link
              to="/notifications"
              className="relative touch-target flex items-center justify-center text-[#0E1F1A]"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#F0C419]" />
              )}
            </Link>
          </header>

          <header className="hidden h-14 items-center justify-between border-b border-[rgba(14,31,26,0.06)] bg-white px-4 lg:flex">
            <div className="text-sm font-semibold text-[#5A6B7D]">{org?.name ?? BRAND.name}</div>
            <div className="flex items-center gap-2">
              <AutonomyPill />
              <Link
                to="/notifications"
                className="relative rounded-lg p-2 text-[#5A6B7D] hover:bg-[#F7FAF6] hover:text-[#0E1F1A]"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#F0C419]" />
                )}
              </Link>
              <button
                type="button"
                onClick={() => navigate("/settings/profile")}
                className="flex items-center gap-2 rounded-xl bg-[#F7FAF6] px-2 py-1.5 text-left hover:bg-[#F4FBE3]"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#D3F36B] text-[11px] font-bold text-[#0E1F1A]">
                  {initials(user.full_name)}
                </div>
                <div className="hidden xl:block">
                  <div className="text-xs font-semibold text-[#0E1F1A]">{user.full_name}</div>
                  <div className="text-[10px] text-[#5A6B7D]">{user.email}</div>
                </div>
              </button>
            </div>
          </header>

          {showConnBanner && connAlert && (
            <div className="flex items-center justify-between gap-3 border-b border-[rgba(14,31,26,0.12)] bg-[#F4FBE3] px-4 py-2 text-xs font-medium text-[#0E1F1A]">
              <span>
                Connection issue: <strong>{connAlert.provider}</strong> needs attention (sync stale or expired).{" "}
                <Link to="/integrations" className="font-bold underline">
                  Fix in Integrations
                </Link>
              </span>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(CONN_BANNER_KEY, "true");
                  setConnBannerDismissed(true);
                }}
                aria-label="Dismiss"
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {showWhatsappBanner && (
            <div className="flex items-center justify-between gap-3 border-b border-[rgba(240,196,25,0.4)] bg-[#FFF8E0] px-4 py-2 text-xs font-medium text-[#8A6A00]">
              <span>
                Verify WhatsApp so Loop can track your commitments.{" "}
                <Link to="/settings/profile" className="font-bold underline">
                  Verify now
                </Link>
              </span>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(BANNER_KEY, "true");
                  setBannerDismissed(true);
                }}
                aria-label="Dismiss"
                className="text-[#8A6A00]/70 hover:text-[#8A6A00]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <main className="flex-1 overflow-y-auto scroll-touch">
            <div className="main-pad mx-auto w-full max-w-[90rem] pb-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px)+1rem)] lg:pb-4">
              <div className="content-canvas min-w-0 overflow-x-clip p-3 sm:p-4 lg:p-5">
                <Outlet />
              </div>
            </div>
          </main>

          <nav className="glass-tabbar safe-pad-bottom fixed bottom-0 left-0 right-0 z-30 flex lg:hidden">
            {tabItems.map(({ to, label, short, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-[#5A6B7D] active:scale-95",
                    isActive && "text-[#0E1F1A]"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn("rounded-lg p-1", isActive && "bg-[rgba(211,243,107,0.25)]")}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    {short ?? label.split(" ")[0]}
                  </>
                )}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-[#5A6B7D] active:scale-95"
            >
              <span className={cn("rounded-lg p-1", moreOpen && "bg-[rgba(211,243,107,0.25)]")}>
                <MoreHorizontal className="h-4 w-4" />
              </span>
              More
            </button>
          </nav>

          {moreOpen && (
            <div className="fixed inset-x-0 bottom-[var(--tab-bar-h)] z-30 border-t border-[rgba(14,31,26,0.1)] bg-white p-3 lg:hidden safe-pad-x animate-fade-in">
              <div className="grid grid-cols-3 gap-2">
                {moreItems.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex flex-col items-center gap-1 rounded-lg bg-[#F7FAF6] px-2 py-3 text-[11px] font-semibold text-[#0E1F1A]"
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
