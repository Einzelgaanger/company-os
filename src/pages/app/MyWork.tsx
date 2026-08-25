import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MessageSquare, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/feedback/states";
import { SensitivityBadge } from "@/components/governance";
import { CostOfDelayBadge, StatusChip, WaitingDuration } from "@/components/flow";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import { recordInboundResponse } from "@/lib/engine";
import { fetchWaiting } from "@/lib/flowData";
import { bandOf, flowStateOf, isOpenState, type WaitingRow } from "@/lib/flow";
import { timeAgo } from "@/lib/utils";
import type { Checkin, Commitment } from "@/lib/types";

/**
 * /my-work — 08_PAGES §8.6. Merges the old /inbox with the personal dashboard:
 * needs a reply from you · waiting on others · moving · recently closed.
 *
 * Deliberately absent, per brief §0.6: any personal statistic. No completion
 * rate, no response rate, no streak. A page that scores a person turns a
 * coordination tool into a surveillance tool, and people route around it.
 */

interface Pending {
  commitment: Commitment;
  message: Checkin;
}

export default function MyWork() {
  const { user, org } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending[]>([]);
  const [mine, setMine] = useState<Commitment[]>([]);
  const [waitingRows, setWaitingRows] = useState<WaitingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [whoOpen, setWhoOpen] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [checkins, commitments, register] = await Promise.all([
      db.listCheckinsForUser(user.id),
      db.listCommitments(user.org_id),
      fetchWaiting(user, "self").catch(() => null),
    ]);

    const cmap = new Map(commitments.map((c) => [c.id, c]));
    const byCommitment = new Map<string, Checkin[]>();
    for (const k of checkins) {
      if (!k.commitment_id) continue;
      const arr = byCommitment.get(k.commitment_id) ?? [];
      arr.push(k);
      byCommitment.set(k.commitment_id, arr);
    }
    const items: Pending[] = [];
    for (const [cid, arr] of byCommitment) {
      const latest = arr.sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1)!;
      const commitment = cmap.get(cid);
      if (latest.direction === "outbound" && commitment && commitment.status !== "done") {
        items.push({ commitment, message: latest });
      }
    }
    items.sort((a, b) => b.message.created_at.localeCompare(a.message.created_at));

    setPending(items);
    setMine(
      commitments.filter((c) => c.owner_id === user.id || c.requested_by_id === user.id),
    );
    setWaitingRows(register?.items ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Items of mine that are stalled on somebody else — not on me. */
  const waitingOnOthers = useMemo(
    () => waitingRows.filter((row) => row.holderUserId !== user?.id).slice(0, 10),
    [waitingRows, user],
  );

  const moving = useMemo(
    () =>
      mine
        .filter((c) => {
          const state = flowStateOf(c);
          return (
            isOpenState(state) &&
            !waitingRows.some((row) => row.id === c.id) &&
            state !== "proposed"
          );
        })
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
        .slice(0, 10),
    [mine, waitingRows],
  );

  const recentlyClosed = useMemo(() => {
    const since = Date.now() - 14 * 86_400_000;
    return mine
      .filter((c) => c.resolved_at && Date.parse(c.resolved_at) >= since)
      .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""))
      .slice(0, 6);
  }, [mine]);

  async function reply(p: Pending, text: string) {
    if (!org || !user || !text.trim()) return;
    const status = await recordInboundResponse(org, user, p.commitment, text);
    setDrafts((d) => ({ ...d, [p.commitment.id]: "" }));
    setWhoOpen((w) => ({ ...w, [p.commitment.id]: false }));
    setWho((w) => ({ ...w, [p.commitment.id]: "" }));
    toast(
      status === "done"
        ? "Marked done — nice."
        : status === "blocked"
          ? "Got it. I'll chase that."
          : "Thanks — logged.",
      "success",
    );
    await load();
  }

  if (!user) return null;

  const nothingAtAll =
    !loading &&
    pending.length === 0 &&
    waitingOnOthers.length === 0 &&
    moving.length === 0 &&
    recentlyClosed.length === 0;

  return (
    <div className="portal-page animate-fade-in">
      <PageHeader
        title="My work"
        description="Your items and your check-ins. Reply here and Loop updates everything else."
      />

      {loading ? (
        <>
          <div className="portal-section h-40 animate-pulse" />
          <div className="portal-section h-32 animate-pulse" />
        </>
      ) : nothingAtAll ? (
        <EmptyState
          illustration={<CheckCircle2 className="h-8 w-8 text-forest" />}
          title="Nothing needs you right now."
          description="Loop will reach out when something needs a status."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <section className="portal-section">
              <header className="portal-section__head">
                <div>
                  <h2 className="portal-section__title">Needs a reply from you</h2>
                  <p className="portal-section__desc">
                    {pending.length} open {pending.length === 1 ? "check-in" : "check-ins"}
                  </p>
                </div>
              </header>
              <div className="divide-y divide-[rgba(14,31,26,0.06)]">
                {pending.map((p) => (
                  <div key={p.commitment.id} className="space-y-3 px-3 py-3 sm:px-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-lime/25 text-forest">
                          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-forest">
                            {p.message.message_text}
                          </div>
                          <div className="mt-1 text-[11px] font-medium text-[#5A6B7D]">
                            {timeAgo(p.message.created_at)} · via{" "}
                            {p.message.channel === "whatsapp" ? "WhatsApp" : "in-app"} ·{" "}
                            <Link
                              to={`/commitments/${p.commitment.id}`}
                              className="font-semibold text-forest underline"
                            >
                              {p.commitment.title}
                            </Link>
                          </div>
                        </div>
                      </div>
                      <SensitivityBadge sensitivity={p.commitment.sensitivity} />
                    </div>

                    <div className="flex flex-col gap-2 sm:pl-9">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => reply(p, "I'm on it — in progress")}
                        >
                          I'm on it
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setWhoOpen((w) => ({ ...w, [p.commitment.id]: !w[p.commitment.id] }))
                          }
                          aria-expanded={Boolean(whoOpen[p.commitment.id])}
                        >
                          Waiting on someone
                        </Button>
                        <Button size="sm" variant="chip" onClick={() => reply(p, "It's done")}>
                          It's done
                        </Button>
                      </div>

                      {whoOpen[p.commitment.id] && (
                        <div className="flex min-w-0 items-center gap-2">
                          <Input
                            value={who[p.commitment.id] ?? ""}
                            onChange={(e) =>
                              setWho((w) => ({ ...w, [p.commitment.id]: e.target.value }))
                            }
                            placeholder="Who or what?"
                            className="min-w-0 flex-1"
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              const value = who[p.commitment.id]?.trim();
                              if (value) reply(p, `Blocked — waiting on ${value}`);
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              const value = who[p.commitment.id]?.trim();
                              if (value) reply(p, `Blocked — waiting on ${value}`);
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      )}

                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          value={drafts[p.commitment.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [p.commitment.id]: e.target.value }))
                          }
                          placeholder="Or say more…"
                          className="min-w-0 flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") reply(p, drafts[p.commitment.id] ?? "");
                          }}
                        />
                        <Button
                          size="icon"
                          className="touch-target shrink-0"
                          onClick={() => reply(p, drafts[p.commitment.id] ?? "")}
                          aria-label="Send reply"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {waitingOnOthers.length > 0 && (
            <section className="portal-section">
              <header className="portal-section__head">
                <div>
                  <h2 className="portal-section__title">Waiting on others</h2>
                  <p className="portal-section__desc">Your items that are stalled elsewhere</p>
                </div>
              </header>
              <div className="divide-y divide-[rgba(14,31,26,0.06)]">
                {waitingOnOthers.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/commitments/${row.id}`}
                        className="block truncate text-sm font-medium text-forest hover:underline"
                      >
                        {row.title}
                      </Link>
                      <div className="text-[11px] font-medium text-[#5A6B7D]">
                        on {row.holderLabel}
                        {row.projectName ? ` · ${row.projectName}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusChip state={row.flowState} attention={row.workingDays >= 7} />
                      <WaitingDuration workingDays={row.workingDays} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="portal-split--aside">
            <section className="portal-section">
              <header className="portal-section__head">
                <div>
                  <h2 className="portal-section__title">Moving</h2>
                  <p className="portal-section__desc">Your items that are not blocked</p>
                </div>
              </header>
              <div className="divide-y divide-[rgba(14,31,26,0.06)]">
                {moving.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] font-medium text-[#5A6B7D]">
                    Nothing active right now.
                  </p>
                ) : (
                  moving.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <Link
                        to={`/commitments/${c.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-forest hover:underline"
                      >
                        {c.title}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <CostOfDelayBadge band={bandOf(c)} />
                        <StatusChip state={flowStateOf(c)} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="portal-section">
              <header className="portal-section__head">
                <div>
                  <h2 className="portal-section__title">Recently closed</h2>
                  <p className="portal-section__desc">Last two weeks</p>
                </div>
              </header>
              <div className="divide-y divide-[rgba(14,31,26,0.06)]">
                {recentlyClosed.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] font-medium text-[#5A6B7D]">
                    Nothing closed in the last two weeks.
                  </p>
                ) : (
                  recentlyClosed.map((c) => (
                    <Link
                      key={c.id}
                      to={`/commitments/${c.id}`}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-soft"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-forest">
                        {c.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[#5A6B7D]">
                        {c.resolved_at ? timeAgo(c.resolved_at) : ""}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
