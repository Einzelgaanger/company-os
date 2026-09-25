import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { projectRoomStore } from "@/lib/projectRoomStore";
import type { Meeting, Project, ProjectChannel, ProjectFile, ProjectMessage, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Pane = "chat" | "files" | "calls";

export function ProjectRoom({
  project,
  user,
  users,
  meetings,
}: {
  project: Project;
  user: User;
  users: User[];
  meetings: Meeting[];
}) {
  const [pane, setPane] = useState<Pane>("chat");
  const [channels, setChannels] = useState<ProjectChannel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [localOnly, setLocalOnly] = useState(false);
  const names = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  async function refresh(nextChannelId = channelId) {
    let shared = true;
    let chans: ProjectChannel[] = [];
    try {
      chans = (await db.listProjectChannels(project.id)) as ProjectChannel[];
    } catch {
      shared = false;
      chans = projectRoomStore.channels(project.id);
    }
    if (!chans.some((c) => c.name === "general")) {
      try {
        const created = (await db.createProjectChannel({
          org_id: project.org_id,
          project_id: project.id,
          name: "general",
          created_by: user.id,
        })) as ProjectChannel;
        chans = [...chans, created];
      } catch {
        shared = false;
        chans = [
          ...chans,
          projectRoomStore.addChannel({
            org_id: project.org_id,
            project_id: project.id,
            name: "general",
            created_by: user.id,
          }),
        ];
      }
    }
    const active = nextChannelId && chans.some((c) => c.id === nextChannelId) ? nextChannelId : chans[0]?.id ?? null;
    let msgs: ProjectMessage[] = [];
    let stored: ProjectFile[] = [];
    if (shared && active) {
      try {
        msgs = (await db.listProjectMessages(active)) as ProjectMessage[];
        stored = (await db.listProjectFiles(project.id)) as ProjectFile[];
      } catch {
        shared = false;
      }
    }
    if (!shared) {
      msgs = active ? projectRoomStore.messages(active) : [];
      stored = projectRoomStore.files(project.id);
    }
    setLocalOnly(!shared);
    setChannels(chans);
    setChannelId(active);
    setMessages(msgs);
    setFiles(stored);
  }

  useEffect(() => {
    void refresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function addTopic() {
    const name = topic.trim();
    if (!name) return;
    setTopic("");
    try {
      if (!localOnly) {
        await db.createProjectChannel({
          org_id: project.org_id,
          project_id: project.id,
          name,
          created_by: user.id,
        });
      } else {
        projectRoomStore.addChannel({
          org_id: project.org_id,
          project_id: project.id,
          name,
          created_by: user.id,
        });
      }
    } catch {
      projectRoomStore.addChannel({
        org_id: project.org_id,
        project_id: project.id,
        name,
        created_by: user.id,
      });
      setLocalOnly(true);
    }
    await refresh();
  }

  async function send(body: string, parentId: string | null) {
    if (!channelId || !body.trim()) return;
    const input = {
      org_id: project.org_id,
      project_id: project.id,
      channel_id: channelId,
      user_id: user.id,
      body: body.trim(),
      parent_id: parentId,
    };
    try {
      if (!localOnly) await db.postProjectMessage(input);
      else projectRoomStore.addMessage(input);
    } catch {
      projectRoomStore.addMessage(input);
      setLocalOnly(true);
    }
    if (parentId) setReply("");
    else setDraft("");
    await refresh(channelId);
  }

  async function addLink() {
    const url = linkUrl.trim();
    const name = linkName.trim() || url;
    if (!url) return;
    const kind = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) ? "image" : "link";
    const input = {
      org_id: project.org_id,
      project_id: project.id,
      kind: kind as "image" | "link",
      name,
      url,
      added_by: user.id,
    };
    try {
      if (!localOnly) await db.addProjectFile(input);
      else projectRoomStore.addFile(input);
    } catch {
      projectRoomStore.addFile(input);
      setLocalOnly(true);
    }
    setLinkName("");
    setLinkUrl("");
    await refresh(channelId);
  }

  async function addUpload(file: File) {
    if (file.size > 1_200_000) return;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const kind = file.type.startsWith("image/") ? "image" : "file";
    const input = {
      org_id: project.org_id,
      project_id: project.id,
      kind: kind as "image" | "file",
      name: file.name,
      url,
      added_by: user.id,
    };
    try {
      if (!localOnly) await db.addProjectFile(input);
      else projectRoomStore.addFile(input);
    } catch {
      projectRoomStore.addFile(input);
      setLocalOnly(true);
    }
    await refresh(channelId);
  }

  const roots = messages.filter((m) => !m.parent_id);
  const replies = messages.filter((m) => m.parent_id === threadId);
  const threadRoot = messages.find((m) => m.id === threadId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["chat", "files", "calls"] as Pane[]).map((id) => (
          <Button key={id} size="sm" variant={pane === id ? "default" : "outline"} onClick={() => setPane(id)}>
            {id === "chat" ? "Chat" : id === "files" ? "Files" : "Calls"}
          </Button>
        ))}
      </div>
      {localOnly && (
        <p className="text-xs text-slate">
          This room is saved in this browser. It is shared across the team once the project room tables are on the database.
        </p>
      )}

      {pane === "chat" && (
        <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate">Topics</p>
            {channels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setThreadId(null);
                  setChannelId(c.id);
                  void refresh(c.id);
                }}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-sm",
                  c.id === channelId ? "bg-ink text-white" : "hover:bg-soft",
                )}
              >
                #{c.name}
              </button>
            ))}
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                void addTopic();
              }}
            >
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="New topic" className="h-8" />
            </form>
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-white p-3">
            {roots.length === 0 && <p className="text-sm text-slate">No messages in this topic yet.</p>}
            {roots.map((m) => {
              const count = messages.filter((r) => r.parent_id === m.id).length;
              return (
                <div key={m.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="text-xs text-slate">{names.get(m.user_id) ?? "Someone"}</div>
                  <p className="text-sm text-ink">{m.body}</p>
                  <button type="button" className="mt-1 text-xs font-medium text-slate" onClick={() => setThreadId(m.id)}>
                    {count ? `${count} in thread` : "Start a thread"}
                  </button>
                </div>
              );
            })}
            {threadRoot && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-slate">Thread · {threadRoot.body}</p>
                {replies.map((m) => (
                  <p key={m.id} className="text-sm">
                    <span className="text-xs text-slate">{names.get(m.user_id) ?? "Someone"} · </span>
                    {m.body}
                  </p>
                ))}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(reply, threadId);
                  }}
                >
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply in thread" />
                  <Button type="submit" size="sm">Reply</Button>
                </form>
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft, null);
              }}
            >
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message #${channels.find((c) => c.id === channelId)?.name ?? "general"}`} />
              <Button type="submit">Send</Button>
            </form>
          </div>
        </div>
      )}

      {pane === "files" && (
        <div className="space-y-3">
          <p className="text-sm text-slate">Every file, image, and link for this project lives here.</p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addLink();
            }}
          >
            <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Name" className="max-w-[180px]" />
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="min-w-[200px] flex-1" />
            <Button type="submit" size="sm">Add link</Button>
            <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm">
              Upload
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void addUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
          </form>
          {files.length === 0 && <p className="text-sm text-slate">Nothing stored yet.</p>}
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="text-[11px] uppercase text-slate">{f.kind}</div>
                </div>
                {f.kind === "image" ? (
                  <img src={f.url} alt="" className="h-12 w-12 rounded object-cover" />
                ) : (
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-sm underline">
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pane === "calls" && (
        <div className="space-y-2">
          <p className="text-sm text-slate">
            Calls land here when they are tied to this project, or when the title mentions the project or its client.
          </p>
          {meetings.length === 0 && <p className="text-sm text-slate">No calls for this project yet.</p>}
          {meetings.map((m) => (
            <div key={m.id} className="rounded-lg border border-border px-3 py-2">
              <div className="text-sm font-medium">{m.title ?? "Untitled call"}</div>
              <div className="text-xs text-slate">
                {m.source}
                {m.occurred_at ? ` · ${new Date(m.occurred_at).toLocaleString()}` : ""}
              </div>
              {m.recording_url && (
                <Link to={m.recording_url} className="text-xs underline" target="_blank">
                  Recording
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
