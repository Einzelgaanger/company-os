import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EscalationStatusBadge, CommitmentStatusBadge } from "@/components/badges";
import { TableSkeleton, ErrorState } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { roleAtLeast, type Escalation, type User } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function EscalationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [note, setNote] = useState("");
  const [rerouteTo, setRerouteTo] = useState("");

  async function load() {
    if (!user || !id) return;
    setLoading(true);
    setError(false);
    try {
      const e = await db.getEscalation(id);
      if (!e) {
        setError(true);
        return;
      }
      setEscalation(e);
      setUsers(await db.listUsers(user.org_id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  if (loading) return <TableSkeleton />;
  if (error || !escalation) return <ErrorState onRetry={load} />;

  const snap = escalation.context_snapshot;
  const canAct = user ? roleAtLeast(user.role, "manager") || escalation.escalated_to_id === user.id : false;

  async function acknowledge() {
    if (!user || !escalation) return;
    await db.acknowledgeEscalation(user, escalation.id);
    toast("Acknowledged. The requester has been notified someone's on it.", "success");
    load();
  }

  async function resolve() {
    if (!user || !escalation || !note.trim()) return;
    await db.resolveEscalation(user, escalation.id, note.trim());
    toast("Marked resolved. The requester has been notified in Loop.", "success");
    setNote("");
    load();
  }

  async function reroute() {
    if (!user || !escalation || !rerouteTo) return;
    await db.rerouteEscalation(user, escalation.id, rerouteTo);
    toast("Re-routed.", "success");
    setRerouteTo("");
    load();
  }

  return (
    <div className="portal-page animate-fade-in">
      <button onClick={() => navigate("/escalations")} className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Escalations
      </button>

      <PageHeader
        title={snap.commitment.title}
        actions={<EscalationStatusBadge status={escalation.status} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-slate">Owner</div>
              <div className="font-medium text-ink">
                {snap.commitment.owner_id ? userMap.get(snap.commitment.owner_id)?.full_name : snap.commitment.owner_external_name}
              </div>
            </div>
            <div>
              <div className="text-slate">Requested by</div>
              <div className="font-medium text-ink">
                {snap.commitment.requested_by_id ? userMap.get(snap.commitment.requested_by_id)?.full_name : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate">Due</div>
              <div className="font-mono text-ink">{formatDate(snap.commitment.due_date)}</div>
            </div>
            <div>
              <div className="text-slate">Current status</div>
              <CommitmentStatusBadge status={snap.commitment.status} />
            </div>
          </div>
          <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
            <div className="text-slate">Reason for escalation</div>
            <div className="text-ink">{escalation.reason}</div>
          </div>
          <div className="inline-flex items-center gap-2 text-slate">
            <Clock className="h-4 w-4" /> {snap.sla_hours_elapsed}h elapsed past SLA
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last exchanges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {snap.checkins.length === 0 ? (
            <p className="text-sm text-slate">No prior check-ins captured.</p>
          ) : (
            snap.checkins.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-center justify-between text-xs text-slate">
                  <span>{c.direction === "outbound" ? "Loop →" : "← Reply"}</span>
                  <span className="font-mono">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-ink">{c.message_text}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canAct && escalation.status !== "resolved" && (
        <Card>
          <CardHeader>
            <CardTitle>Take action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {escalation.status === "open" && (
              <Button variant="outline" onClick={acknowledge}>
                Acknowledge
              </Button>
            )}
            <div className="space-y-1.5">
              <Label>Re-route to</Label>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={rerouteTo}
                  onChange={(e) => setRerouteTo(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" disabled={!rerouteTo} onClick={() => void reroute()}>
                  Re-route
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Resolution note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line on how this was resolved" />
            </div>
            <Button onClick={resolve} disabled={!note.trim()}>
              Mark resolved
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
