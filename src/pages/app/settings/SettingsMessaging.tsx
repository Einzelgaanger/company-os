import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { api, apiConfigured, type ApiMessageApproval } from "@/lib/api";
import type { MessagingMetrics } from "@/lib/types";

/** Inline template registry (mirrors @loop/messaging seeds — Vite may not resolve workspace pkg). */
const TEMPLATES = [
  { key: "otp_verify", purpose: "Onboarding verification", metaStatus: "approved" as const },
  { key: "checkin_evidence", purpose: "Evidence check-in", metaStatus: "approved" as const },
  { key: "unblock_request", purpose: "Ask holder to unblock", metaStatus: "approved" as const },
  { key: "help_reply", purpose: "HELP command reply", metaStatus: "approved" as const },
  { key: "nudge_feedback", purpose: "Was this nudge useful?", metaStatus: "pending" as const },
  { key: "waiting_who", purpose: "Clarify who holds it", metaStatus: "approved" as const },
  { key: "clarify", purpose: "Reply was unclear", metaStatus: "pending" as const },
  { key: "escalation_notify", purpose: "To the escalation owner", metaStatus: "approved" as const },
];

/**
 * §9.3 Messaging — Meta tier, quality, caps, rates, templates, opt-in + approval queue.
 * The queue is backed by `message_approvals`; without the API it is session-only
 * and nothing is persisted in the browser.
 */
export default function SettingsMessaging() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<MessagingMetrics | null>(null);
  const [queue, setQueue] = useState<ApiMessageApproval[]>([]);
  const [optInBreakdown, setOptInBreakdown] = useState({
    optedIn: 0,
    notVerified: 0,
    optedOut: 0,
  });
  const [people, setPeople] = useState<Array<{ name: string; status: string }>>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [m, users] = await Promise.all([
        db.getMessagingMetrics(user.org_id),
        db.listUsers(user.org_id),
      ]);
      setMetrics(m ?? null);
      let optedIn = 0;
      let notVerified = 0;
      let optedOut = 0;
      const rows: Array<{ name: string; status: string }> = [];
      for (const u of users.filter((x) => x.status === "active")) {
        if (!u.notification_prefs.whatsapp_checkins) {
          optedOut++;
          rows.push({ name: u.full_name, status: "opted out" });
        } else if (!u.phone_verified_at) {
          notVerified++;
          rows.push({ name: u.full_name, status: "not verified" });
        } else {
          optedIn++;
          rows.push({ name: u.full_name, status: "opted in" });
        }
      }
      setOptInBreakdown({ optedIn, notVerified, optedOut });
      setPeople(rows);
    })();
  }, [user]);

  useEffect(() => {
    if (!apiConfigured()) return;
    void api
      .listMessageApprovals()
      .then((res) => setQueue(res.items.filter((i) => i.status === "pending")))
      .catch(() => setQueue([]));
  }, [user]);

  const optOutWarn = (metrics?.opt_out_rate_7d ?? 0) >= 0.02;
  const blockWarn = (metrics?.block_rate_7d ?? 0) >= 0.03;
  const nearCap =
    metrics != null && metrics.sends_last_24h / metrics.send_cap_per_day >= 0.8;
  const autoThrottle = optOutWarn || blockWarn || nearCap || metrics?.quality_rating === "red";

  const preview =
    "Hi Kayode, checking in on *SharePoint migration* — it's due Fri. How's it going?";

  const queueSend = async () => {
    if (!apiConfigured()) {
      toast("Connect the API to queue a real send.", "error");
      return;
    }
    try {
      const res = await api.queueMessage({ templateKey: "checkin_pre_due", preview });
      setQueue((prev) => [res.approval, ...prev]);
      toast("Outbound queued for approval", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not queue the send.", "error");
    }
  };

  const decide = async (id: string, approved: boolean) => {
    try {
      await api.decideMessageApproval(id, approved);
      setQueue((prev) => prev.filter((q) => q.id !== id));
      toast(approved ? "Approved — queued to send" : "Rejected — will not send", approved ? "success" : "default");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not record the decision.", "error");
    }
  };

  const empty = useMemo(() => queue.length === 0, [queue]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messaging"
        description="WhatsApp quality, caps, templates, and pilot approval queue."
      />

      {metrics ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Meta tier" value={metrics.meta_tier} />
          <Metric label="Quality" value={metrics.quality_rating} />
          <Metric
            label="Send cap (24h)"
            value={`${metrics.sends_last_24h} / ${metrics.send_cap_per_day}`}
          />
          <Metric label="Opt-in contacts" value={String(metrics.opt_in_count)} />
          <Metric
            label="7d opt-out rate"
            value={`${(metrics.opt_out_rate_7d * 100).toFixed(2)}%`}
            warn={optOutWarn}
            mark="Mark at 2%"
          />
          <Metric
            label="7d block rate"
            value={`${(metrics.block_rate_7d * 100).toFixed(2)}%`}
            warn={blockWarn}
            mark="Mark at 3%"
          />
        </section>
      ) : (
        <p className="text-sm text-[#5A6B7D]">No messaging metrics seeded for this org.</p>
      )}

      <section className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4 text-sm">
        <h2 className="mb-2 font-bold text-[#0E1F1A]">Throttle</h2>
        <p className="text-[#5A6B7D]">
          {autoThrottle
            ? `Auto-throttled because ${
                metrics?.quality_rating === "red"
                  ? "quality is red"
                  : optOutWarn
                    ? "7-day opt-out rate ≥ 2%"
                    : blockWarn
                      ? "7-day block rate ≥ 3%"
                      : "send volume is near the daily cap"
              }. Loop spaces outbound check-ins until marks recover.`
            : "Loop spaces outbound check-ins and stops when approaching Meta quality or send-cap marks. Manual approve stays on during the pilot so nothing leaves without an operator click."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline">Manual approve: on</Badge>
          <Badge variant="outline">Email ingestion: off (C-5)</Badge>
          {autoThrottle ? <Badge variant="outline">Throttled</Badge> : null}
        </div>
      </section>

      <section className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4 text-sm">
        <h2 className="mb-2 font-bold text-[#0E1F1A]">Opt-in breakdown</h2>
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          <span>Opted in: {optInBreakdown.optedIn}</span>
          <span>Not verified: {optInBreakdown.notVerified}</span>
          <span>Opted out: {optInBreakdown.optedOut}</span>
        </div>
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-[#5A6B7D]">
          {people.map((p) => (
            <li key={p.name} className="flex justify-between gap-2">
              <span className="text-[#0E1F1A]">{p.name}</span>
              <span>{p.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[rgba(14,31,26,0.1)] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-[#0E1F1A]">Template registry</h2>
        <ul className="space-y-2 text-sm">
          {TEMPLATES.map((t) => (
            <li
              key={t.key}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(14,31,26,0.06)] py-1.5 last:border-0"
            >
              <code className="font-mono text-[11px]">{t.key}</code>
              <span className="text-[#5A6B7D]">{t.purpose}</span>
              <Badge variant="outline">{t.metaStatus}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#0E1F1A]">Approval queue</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void queueSend()}>
            Queue check-in
          </Button>
        </div>
        {empty ? (
          <p className="text-sm text-[#5A6B7D]">No outbound messages waiting for approval.</p>
        ) : (
          <ul className="space-y-3">
            {queue.map((item) => (
              <li key={item.id} className="border border-[rgba(14,31,26,0.12)] bg-white p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <code className="font-mono text-[11px] text-slate">{item.templateKey}</code>
                  <span className="text-[11px] text-slate">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mb-3 text-slate">{item.preview}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="btn-primary"
                    onClick={() => void decide(item.id, true)}
                  >
                    Approve send
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void decide(item.id, false)}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  warn,
  mark,
}: {
  label: string;
  value: string;
  warn?: boolean;
  mark?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        warn ? "border-amber-400 bg-amber-50" : "border-[rgba(14,31,26,0.1)] bg-white"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5A6B7D]">{label}</div>
      <div className="mt-1 text-lg font-bold text-[#0E1F1A]">{value}</div>
      {mark ? <div className="text-[10px] text-[#5A6B7D]">{mark}</div> : null}
    </div>
  );
}
