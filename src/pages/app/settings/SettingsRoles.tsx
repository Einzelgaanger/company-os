import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InviteDialog } from "@/components/InviteDialog";
import { TableSkeleton } from "@/components/states";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { Role, User } from "@/lib/types";

const ROLES: Role[] = ["member", "manager", "admin", "owner"];

export default function SettingsRoles() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    setUsers(await db.listUsers(user.org_id));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const ownerCount = useMemo(() => users.filter((u) => u.role === "owner").length, [users]);

  if (!user) return null;

  async function changeRole(target: User, role: Role) {
    if (target.role === "owner" && role !== "owner" && ownerCount <= 1) {
      toast("This is the only Owner on the account. Assign another Owner before changing this role.", "error");
      return;
    }
    if (role === "owner" && user!.role !== "owner") {
      toast("Only an Owner can promote someone to Owner.", "error");
      return;
    }
    await db.changeRole(user!, target.id, role);
    await refresh();
    await load();
    toast("Saved.", "success");
  }

  async function changeManager(target: User, managerId: string) {
    await db.setManager(target.id, managerId === "none" ? null : managerId);
    load();
    toast("Saved.", "success");
  }

  const roleOptions = (target: User): Role[] =>
    ROLES.filter((r) => (r === "owner" ? user!.role === "owner" || target.role === "owner" : true));

  if (loading) return <TableSkeleton />;

  return (
    <>
      <div className="flex justify-end">
        <InviteDialog onInvited={load} />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-ink">{u.full_name}</TableCell>
                <TableCell className="text-slate">{u.email}</TableCell>
                <TableCell>
                  <div className="w-32">
                    <Select value={u.role} onValueChange={(v) => changeRole(u, v as Role)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {roleOptions(u).map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="w-40">
                    <Select value={u.manager_id ?? "none"} onValueChange={(v) => changeManager(u, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No manager</SelectItem>
                        {users.filter((m) => m.id !== u.id).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "active" ? "green" : u.status === "invited" ? "amber" : "default"} className="capitalize">
                    {u.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
