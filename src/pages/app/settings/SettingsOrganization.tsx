import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured } from "@/lib/api";
import { db } from "@/lib/db";

const TIMEZONES = ["Africa/Nairobi", "Africa/Lagos", "Africa/Johannesburg", "Europe/London", "America/New_York", "UTC"];

type Holiday = { id: string; date: string; name: string };

export default function SettingsOrganization() {
  const { org, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [sla, setSla] = useState(24);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  useEffect(() => {
    if (org) {
      setName(org.name);
      setTimezone(org.settings.timezone ?? "Africa/Nairobi");
      setSla(org.settings.escalation_sla_hours ?? 24);
    }
  }, [org]);

  useEffect(() => {
    if (!org) return;
    if (apiConfigured()) {
      void api
        .listHolidays()
        .then((res) => setHolidays(res.items))
        .catch(() => setHolidays([]));
      return;
    }
    void db.listHolidays(org.id).then((items) =>
      setHolidays(items.map((h) => ({ id: h.id, date: h.date, name: h.name }))),
    );
  }, [org]);

  if (!org) return null;

  async function save() {
    if (!org) return;
    await db.updateOrg(org.id, {
      name: name.trim(),
      settings: { ...org.settings, timezone, escalation_sla_hours: sla },
    });
    await refresh();
    toast("Saved.", "success");
  }

  async function addHoliday() {
    if (!holidayDate || !holidayName.trim() || !org) return;
    try {
      if (apiConfigured()) {
        await api.addHoliday({ date: holidayDate, name: holidayName.trim() });
        const res = await api.listHolidays();
        setHolidays(res.items);
      } else {
        const row = await db.addHoliday(org.id, { date: holidayDate, name: holidayName.trim() });
        setHolidays((prev) => [...prev, { id: row.id, date: row.date, name: row.name }]);
      }
      setHolidayDate("");
      setHolidayName("");
      toast("Holiday added.", "success");
    } catch {
      toast("Could not add holiday.", "error");
    }
  }

  async function removeHoliday(id: string) {
    try {
      if (apiConfigured()) await api.deleteHoliday(id);
      else await db.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      toast("Removed.", "success");
    } catch {
      toast("Could not remove holiday.", "error");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <p className="text-xs text-slate">Drives when daily reports and check-ins fire.</p>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default escalation SLA (hours)</Label>
            <Input
              type="number"
              min={1}
              className="max-w-[120px] font-mono"
              value={sla}
              onChange={(e) => setSla(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public holidays</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate">
            Used by working-time maths (§4.4). Pilot tenants seed Kenya&apos;s public holidays.
          </p>
          {holidays.length === 0 ? (
            <p className="text-sm text-slate">No holidays yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono text-xs text-slate">{h.date}</span>
                    <span className="ml-2 font-medium text-ink">{h.name}</span>
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void removeHoliday(h.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              className="max-w-[160px]"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
            />
            <Input
              className="max-w-xs"
              placeholder="Holiday name"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
            />
            <Button type="button" onClick={() => void addHoliday()}>
              Add holiday
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save}>Save changes</Button>
    </>
  );
}
