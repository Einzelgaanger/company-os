import { NavLink, Outlet } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { roleAtLeast, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Item {
  to: string;
  label: string;
  minRole?: Role;
}

const ITEMS: Item[] = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/my-data", label: "My data" },
  { to: "/settings/organization", label: "Organization", minRole: "admin" },
  { to: "/settings/people", label: "People", minRole: "admin" },
  { to: "/settings/teams", label: "Teams", minRole: "admin" },
  { to: "/settings/roles", label: "Roles", minRole: "admin" },
  { to: "/settings/ownership-map", label: "Ownership map", minRole: "admin" },
  { to: "/settings/data-governance", label: "Data governance", minRole: "admin" },
  { to: "/settings/messaging", label: "Messaging", minRole: "admin" },
  { to: "/settings/nudge-quality", label: "Nudge quality", minRole: "admin" },
  { to: "/settings/launch", label: "Launch readiness", minRole: "admin" },
  { to: "/settings/sso", label: "SSO", minRole: "admin" },
  { to: "/settings/reports", label: "Reports", minRole: "admin" },
  { to: "/settings/compliance", label: "Compliance", minRole: "admin" },
  { to: "/settings/security", label: "Security", minRole: "admin" },
  { to: "/settings/billing", label: "Billing", minRole: "owner" },
];

export function SettingsLayout() {
  const { user } = useAuth();
  if (!user) return null;
  const items = ITEMS.filter((i) => !i.minRole || roleAtLeast(user.role, i.minRole));

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader title="Settings" description="Profile, org, roles, and security." />
      <div className="flex flex-col gap-4 lg:flex-row">
        <nav className="underline-tabs overflow-x-auto lg:flex lg:w-44 lg:flex-col lg:gap-0.5 lg:border-b-0 lg:border-r lg:border-[rgba(14,31,26,0.1)] lg:pr-3">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn(
                  "underline-tab whitespace-nowrap lg:rounded-lg lg:border-b-0 lg:px-3 lg:py-2",
                  isActive && "active lg:bg-mint lg:text-forest"
                )
              }
            >
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
