import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/toast";
import { db } from "@/lib/db";
import {
  channelDisplayName,
  preferredChannel,
  preferredChannelLabel,
} from "@/lib/messaging";
import { type Checkin, type OrgInvite, type User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "@/components/PersonAvatar";

const POLL_MS = 4000;

export default function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<User[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [threadUserId, setThreadUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Checkin[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeId = threadUserId ?? user?.id ?? null;

  const threadUser = useMemo(
    () => team.find((u) => u.id === activeId) ?? user ?? null,
    [team, activeId, user],
  );

  async function loadTeam() {
    if (!user) return;
    const [users, pending] = await Promise.all([
      db.listUsers(user.org_id),
      db.listInvites(user.org_id).catch(() => [] as OrgInvite[]),
    ]);
    const people = users.filter((u) => u.status !== "disabled");
    const known = new Set(people.map((u) => u.email.toLowerCase()));
    setTeam(people);
    setInvites(pending.filter((inv) => !known.has(inv.email.toLowerCase())));
  }

  async function loadMessages() {
    if (!activeId) return;
    try {
      const rows = await db.listCheckinsForUser(activeId);
      setMessages(rows);
    } catch {
      /* keep last */
    }
  }

  useEffect(() => {
    void loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    if (!threadUserId) setThreadUserId(user.id);
  }, [user, threadUserId]);

  useEffect(() => {
    void loadMessages();
    const t = window.setInterval(() => void loadMessages(), POLL_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!user || !activeId || !draft.trim()) return;
    setBusy(true);
    try {
      await db.sendChatMessage(user, draft.trim(), { targetUserId: activeId });
      setDraft("");
      await loadMessages();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const railPeople = [...team].sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="portal-page animate-fade-in flex h-[calc(100dvh-11.5rem)] min-h-0 flex-col gap-3 lg:h-[calc(100vh-6rem)] lg:min-h-[28rem] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="Chat"
          description="Same thread as Telegram/WhatsApp — reply here to launch now; connect a channel anytime in Profile."
        />

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5B6560]">
          <span>
            Talking as{" "}
            <strong className="text-[#0E1F1A]">{threadUser?.full_name ?? "…"}</strong>
          </span>
          {threadUser && (
            <Badge variant="outline">
              Prefers {preferredChannelLabel(preferredChannel(threadUser))}
            </Badge>
          )}
          <Link to="/settings/profile" className="text-[#0E1F1A] underline-offset-2 hover:underline">
            Messaging settings
          </Link>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[rgba(14,31,26,0.1)] bg-white">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-[#5B6560]">
                <MessageSquare className="h-8 w-8 text-[#0E1F1A]/40" strokeWidth={1.5} />
                <p>No messages yet. Say hi — Company OS will reply here.</p>
                <p className="max-w-sm text-xs">
                  When this person links Telegram or WhatsApp, those messages show up in this same thread.
                </p>
              </div>
            )}
            {messages.map((m) => {
              const fromBot = m.direction === "outbound";
              return (
                <div
                  key={m.id}
                  className={cn("flex", fromBot ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      fromBot
                        ? "bg-ink text-[color:var(--brand-on-forest)]"
                        : "bg-[color:var(--brand-chat-outbound)] text-ink",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.message_text}</p>
                    <div
                      className={cn(
                        "mt-1.5 flex flex-wrap items-center gap-2 text-[10px]",
                        fromBot ? "text-white/55" : "text-[#5B6560]",
                      )}
                    >
                      <span>{channelDisplayName(m.channel)}</span>
                      <span>·</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                      {m.commitment_id && (
                        <>
                          <span>·</span>
                          <Link
                            to={`/commitments/${m.commitment_id}`}
                            className={cn(
                              "underline-offset-2 hover:underline",
                              fromBot ? "text-[#D3F36B]" : "text-[#0E1F1A]",
                            )}
                          >
                            Commitment
                          </Link>
                        </>
                      )}
                      {m.parsed_status && (
                        <Badge variant="outline" className="text-[10px]">
                          {m.parsed_status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-[rgba(14,31,26,0.08)] p-3">
            <div className="flex gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply with on track, blocked, done — or just say hi…"
                className="min-h-[44px] flex-1 resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                className="h-auto shrink-0 self-end"
                disabled={busy || !draft.trim()}
                onClick={() => void send()}
              >
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>

      <aside className="w-full shrink-0 lg:w-56">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5B6560]">
          Team
        </p>
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-[rgba(14,31,26,0.1)] bg-white p-2">
          {railPeople.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setThreadUserId(u.id)}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left text-sm",
                  activeId === u.id ? "bg-ink text-white" : "hover:bg-[color:var(--brand-on-forest)]",
                )}
              >
                <span className="flex items-center gap-2">
                  <PersonAvatar name={u.full_name} url={u.avatar_url} className="h-6 w-6 text-[9px]" />
                  <span className="truncate font-medium">{u.full_name}</span>
                </span>
                <div
                  className={cn(
                    "truncate text-[10px]",
                    activeId === u.id ? "text-white/60" : "text-[#5B6560]",
                  )}
                >
                  {u.status === "invited" ? "Invited" : preferredChannelLabel(preferredChannel(u))}
                </div>
              </button>
            </li>
          ))}
          {invites.map((inv) => (
            <li key={inv.token}>
              <div className="w-full rounded-lg px-2.5 py-2 text-left text-sm">
                <div className="truncate font-medium">{inv.email}</div>
                <div className="truncate text-[10px] text-[#5B6560]">Invited</div>
              </div>
            </li>
          ))}
          {railPeople.length === 0 && invites.length === 0 && (
            <li className="px-2.5 py-2 text-xs text-[#5B6560]">No teammates yet.</li>
          )}
        </ul>
      </aside>
    </div>
  );
}
