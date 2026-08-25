import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, FileText, Plug } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import type { AppNotification } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const ICONS = {
  escalation: AlertTriangle,
  report: FileText,
  connection_error: Plug,
  system: Bell,
};

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AppNotification[]>([]);

  async function load() {
    if (!user) return;
    setLoading(true);
    setItems(await db.listNotifications(user.id));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function markAll() {
    if (!user) return;
    await db.markAllNotificationsRead(user.id);
    load();
  }

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Notifications"
        description="Everything Loop has surfaced to you."
        actions={items.some((n) => !n.read_at) ? <Button variant="outline" onClick={markAll}>Mark all read</Button> : undefined}
      />

      {loading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title="You're all caught up" description="Loop will let you know when something needs you." />
      ) : (
        <Card>
          <CardContent className="p-0">
            {items.map((n) => {
              const Icon = ICONS[n.kind];
              return (
                <button
                  key={n.id}
                  onClick={async () => {
                    await db.markNotificationRead(n.id);
                    if (n.link) navigate(n.link);
                    else load();
                  }}
                  className="flex w-full items-start gap-3 border-b border-border p-4 text-left last:border-0 hover:bg-secondary/50"
                >
                  <span className={cn("mt-0.5 rounded-md p-1.5", n.read_at ? "bg-secondary text-slate" : "bg-teal/10 text-teal")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm", n.read_at ? "text-slate" : "font-medium text-ink")}>{n.title}</span>
                      {!n.read_at && <span className="h-2 w-2 rounded-full bg-teal" />}
                    </div>
                    <p className="text-sm text-slate">{n.body}</p>
                  </div>
                  <span className="font-mono text-xs text-slate">{timeAgo(n.created_at)}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
