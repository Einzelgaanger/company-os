import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { t } from "@/lib/copy";
import type { ApiNoticeAck } from "@/lib/api";
import { fetchNoticeAck } from "@/lib/legalRecords";
import type { Checkin, Commitment, Connection, SurveyAnswer } from "@/lib/types";
import { DB_KEY } from "@/lib/data/store";

/**
 * C-3 — What Loop knows about me. Full inventory + export + DSR + WhatsApp off.
 */
export default function SettingsMyData() {
  const { user, org, refresh } = useAuth();
  const { toast } = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [messages, setMessages] = useState<Checkin[]>([]);
  const [surveys, setSurveys] = useState<SurveyAnswer[]>([]);
  const [retention, setRetention] = useState(12);

  // Acknowledgement lives in users.notice_acknowledged_at — read, never written, here.
  const [notice, setNotice] = useState<ApiNoticeAck | null>(null);

  useEffect(() => {
    void fetchNoticeAck().then(setNotice);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !org) return;
    setRetention(org.settings.data_retention_months ?? 12);
    void (async () => {
      const [conns, cms, checks] = await Promise.all([
        db.listConnections(user.org_id),
        db.listCommitments(user.org_id),
        db.listCheckins(user.org_id),
      ]);
      setConnections(conns.filter((c) => !c.user_id || c.user_id === user.id));
      setCommitments(cms.filter((c) => c.owner_id === user.id || c.requested_by_id === user.id));
      setMessages(checks.filter((c) => c.user_id === user.id));
      try {
        const raw = localStorage.getItem(DB_KEY);
        const data = raw ? (JSON.parse(raw) as { survey_answers?: SurveyAnswer[] }) : null;
        setSurveys((data?.survey_answers ?? []).filter((a) => a.user_id === user.id));
      } catch {
        setSurveys([]);
      }
    })();
  }, [user, org]);

  if (!user) return null;

  function exportJson() {
    const payload = {
      user: { id: user!.id, email: user!.email, full_name: user!.full_name, role: user!.role },
      org: org?.name,
      notice,
      connections,
      commitments: commitments.map((c) => ({ id: c.id, title: c.title, status: c.status })),
      messages: messages.map((m) => ({ id: m.id, direction: m.direction, created_at: m.created_at })),
      survey_response_ids: surveys.map((s) => s.id),
      retention_months: retention,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    download(blob, `loop-my-data-${user!.id.slice(0, 8)}.json`);
    toast("JSON export downloaded.", "success");
  }

  async function requestDsr(type: "erasure" | "rectification" | "access") {
    await db.createDsrRequest({
      org_id: user!.org_id,
      user_id: user!.id,
      type,
      detail:
        type === "erasure"
          ? "Please erase personal messages and survey responses."
          : type === "rectification"
            ? "Please correct my profile / contact data."
            : "Please provide a full access export.",
    });
    toast("Request recorded. Admins notified (30-day SLA).", "success");
  }

  async function deleteSurveyResponses() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { survey_answers?: SurveyAnswer[] };
      data.survey_answers = (data.survey_answers ?? []).filter((a) => a.user_id !== user!.id);
      localStorage.setItem(DB_KEY, JSON.stringify(data));
      setSurveys([]);
      toast("Survey responses deleted from local store.", "success");
    } catch {
      toast(t("C-ERR-GENERIC"), "error");
    }
  }

  async function turnWhatsAppOff() {
    await db.updateUser(user!.id, {
      notification_prefs: { ...user!.notification_prefs, whatsapp_checkins: false },
    });
    await refresh();
    toast(t("C-WHATSAPP-OFF"), "default");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="My data" subtitle="Everything Loop holds about you — and your rights." />

      <div className="portal-callout">
        Your individual survey answers are never shown to your manager or leadership. Only combined summaries across at
        least 5 people are reported. Loop does not produce a score, rating, or ranking of you.
      </div>

      <Inventory
        rows={[
          ["Connections", String(connections.length)],
          ["Commitments (owned / requested)", String(commitments.length)],
          ["WhatsApp / check-in messages", String(messages.length)],
          ["Survey responses", String(surveys.length)],
          ["Notice acknowledged", notice?.version ? `${notice.version}` : "Not yet"],
          ["Retention window", `${retention} months`],
        ]}
      />

      <section className="portal-section">
        <header className="portal-section__head">
          <div>
            <h2 className="portal-section__title">Actions</h2>
            <p className="portal-section__desc">Access, correction, erasure, and channel controls</p>
          </div>
        </header>
        <div className="portal-section__body--pad flex flex-wrap gap-2">
          <Button className="btn-primary" onClick={exportJson}>
            Export JSON
          </Button>
          <Button variant="outline" onClick={() => void requestDsr("access")}>
            Request access
          </Button>
          <Button variant="outline" onClick={() => void requestDsr("rectification")}>
            Request correction
          </Button>
          <Button variant="outline" onClick={() => void requestDsr("erasure")}>
            Request erasure
          </Button>
          <Button variant="outline" onClick={() => void deleteSurveyResponses()}>
            Delete survey responses
          </Button>
          <Button variant="secondary" onClick={() => void turnWhatsAppOff()}>
            Turn WhatsApp check-ins off
          </Button>
        </div>
        <p className="px-3 pb-3 text-[11px] font-medium text-[#5A6B7D]">
          Erasure is not absolute: commitments you owned remain part of the organizational record with your name
          replaced by &quot;Former team member&quot; after deprovisioning. Messages and survey responses are deleted.
        </p>
      </section>
    </div>
  );
}

function Inventory({ rows }: { rows: [string, string][] }) {
  return (
    <section className="portal-section">
      <header className="portal-section__head">
        <div>
          <h2 className="portal-section__title">Inventory</h2>
          <p className="portal-section__desc">What Loop currently holds</p>
        </div>
      </header>
      <div className="portal-section__body--pad grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-md border border-[#0E1F1A]/6 bg-[#f7faf6] p-2">
            <div className="text-[10px] font-semibold text-[#5A6B7D]">{k}</div>
            <div className="font-medium text-[#0E1F1A]">{v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
