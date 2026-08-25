import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import type { ProjectStatus, User } from "@/lib/types";

export default function ProjectNew() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [ownerId, setOwnerId] = useState(user?.id ?? "");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) void db.listUsers(user.org_id).then(setUsers);
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const created = await db.createProject({
        org_id: user.org_id,
        name: name.trim(),
        description: description.trim() || null,
        client_name: clientName.trim() || null,
        status,
        owner_id: ownerId || null,
      });
      toast("Saved.", "success");
      navigate(`/projects/${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page animate-fade-in">
      <button onClick={() => navigate("/projects")} className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Projects
      </button>
      <PageHeader title="New project" />
      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client name (optional)</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create project"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate("/projects")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
