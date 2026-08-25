import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/db";

export default function SettingsBilling() {
  const { user, org } = useAuth();
  const [seats, setSeats] = useState(0);

  useEffect(() => {
    if (user) void db.listUsers(user.org_id).then((u) => setSeats(u.filter((x) => x.status !== "disabled").length));
  }, [user]);

  if (!org) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan &amp; billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="teal" className="capitalize">{org.plan}</Badge>
          <span className="text-sm text-slate">{seats} active seats</span>
        </div>
        <p className="text-sm text-slate">
          You're on the pilot plan. Billing is managed manually during the pilot phase.
        </p>
        <Button variant="outline" asChild>
          <a href="mailto:hello@loop.app?subject=Loop plan change">Contact us to change plan</a>
        </Button>
      </CardContent>
    </Card>
  );
}
