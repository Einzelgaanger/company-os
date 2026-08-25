import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { roleAtLeast, type Report } from "@/lib/types";
import { format, parseISO } from "date-fns";

function summarize(r: Report): string {
  const j = r.content_json as Record<string, number>;
  const bits: string[] = [];
  if (j.escalated) bits.push(`${j.escalated} escalation${j.escalated > 1 ? "s" : ""}`);
  if (j.resolved) bits.push(`${j.resolved} resolved`);
  if (j.overdue) bits.push(`${j.overdue} overdue`);
  return bits.join(", ") || "No notable activity";
}

export default function Reports() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const r = await db.listReports(user.org_id);
      setReports(r.sort((a, b) => b.period_end.localeCompare(a.period_end)));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const grouped = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of reports) {
      const key = format(parseISO(r.period_end), "MMMM yyyy");
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [reports]);

  if (!user) return null;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="Reports"
        description="Every summary Loop has generated for your team."
        actions={
          roleAtLeast(user.role, "admin") ? (
            <Button variant="outline" onClick={() => navigate("/reports/settings")}>
              <Settings className="h-4 w-4" /> Report settings
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : reports.length === 0 ? (
        <EmptyState title="No reports yet" description="Loop generates these on your configured cadence." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([month, items]) => (
            <div key={month} className="space-y-2">
              <h2 className="font-mono text-xs uppercase tracking-wide text-slate">{month}</h2>
              {items.map((r) => (
                <Card key={r.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate(`/reports/${r.id}`)}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.type === "daily" ? "teal" : "outline"}>{r.type === "daily" ? "Daily" : "Weekly"}</Badge>
                        <span className="font-mono text-xs text-slate">
                          {format(parseISO(r.period_start), "MMM d")} – {format(parseISO(r.period_end), "MMM d")}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate">{summarize(r)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
