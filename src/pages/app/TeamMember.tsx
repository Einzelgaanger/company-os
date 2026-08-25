import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CommitmentStatusBadge, PriorityBadge, RoleBadge } from "@/components/badges";
import { TableSkeleton, ErrorState } from "@/components/states";
import { SendCheckinDialog } from "@/components/SendCheckinDialog";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";
import { roleAtLeast, type Checkin, type Commitment, type User } from "@/lib/types";
import { formatDate, formatDateTime, initials } from "@/lib/utils";

export default function TeamMember() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [member, setMember] = useState<User | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  async function load() {
    if (!user || !id) return;
    setLoading(true);
    setError(false);
    try {
      const m = await db.getUser(id);
      if (!m) {
        setError(true);
        return;
      }
      const [allC, ck, allU] = await Promise.all([
        db.listCommitments(user.org_id),
        db.listCheckinsForUser(id),
        db.listUsers(user.org_id),
      ]);
      setMember(m);
      setCommitments(allC.filter((c) => c.owner_id === id));
      setCheckins(ck);
      setUsers(allU);
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

  const trend = useMemo(() => {
    const outbound = checkins.filter((c) => c.direction === "outbound").slice(0, 5);
    const inbound = checkins.filter((c) => c.direction === "inbound");
    const answered = outbound.filter((o) =>
      inbound.some((i) => i.commitment_id === o.commitment_id && i.created_at >= o.created_at)
    ).length;
    return { answered, total: outbound.length };
  }, [checkins]);

  if (loading) return <TableSkeleton />;
  if (error || !member) return <ErrorState onRetry={load} />;

  const canAdmin = user ? roleAtLeast(user.role, "admin") : false;

  return (
    <div className="portal-page animate-fade-in">
      <button onClick={() => navigate("/team")} className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Team
      </button>

      <PageHeader
        title={member.full_name}
        actions={<SendCheckinDialog users={users} presetUserId={member.id} onSent={load} />}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{initials(member.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{member.full_name}</span>
              <RoleBadge role={member.role} />
            </div>
            <div className="text-sm text-slate">{member.email}</div>
          </div>
          <div className="text-sm">
            {member.phone_verified_at ? (
              <span className="inline-flex items-center gap-1 text-green">
                <CheckCircle2 className="h-4 w-4" /> WhatsApp verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber">
                <XCircle className="h-4 w-4" /> WhatsApp not verified
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {trend.total > 0 && (
        <p className="text-sm text-[#5A6B7D]">
          Responded to {trend.answered} of {trend.total} check-ins in the last batch — a coordination fact, not an
          evaluation (C-1).
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Commitments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {commitments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">No commitments assigned.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Title</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitments.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/commitments/${c.id}`)}>
                    <TableCell className="pl-5 font-medium text-ink">{c.title}</TableCell>
                    <TableCell className="font-mono text-xs text-slate">{formatDate(c.due_date)}</TableCell>
                    <TableCell><CommitmentStatusBadge status={c.status} /></TableCell>
                    <TableCell><PriorityBadge priority={c.priority} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check-in history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checkins.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate">No check-ins yet.</p>
          ) : (
            checkins.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate">{c.direction === "outbound" ? "Loop →" : "← Reply"}</span>
                  <span className="font-mono text-xs text-slate">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-ink">{c.message_text}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canAdmin && member.id !== user?.id && (
        <p className="text-xs text-slate">
          Manage this person's role and access from{" "}
          <button className="text-teal hover:underline" onClick={() => navigate("/settings/roles")}>
            Team &amp; roles
          </button>
          .
        </p>
      )}
    </div>
  );
}
