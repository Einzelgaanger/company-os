import { nowIso, uuid } from "./utils";
import type { ProjectChannel, ProjectFile, ProjectMessage } from "./types";

const KEY = "loop.project-room.v1";

type Room = {
  channels: ProjectChannel[];
  messages: ProjectMessage[];
  files: ProjectFile[];
};

function blank(): Room {
  return { channels: [], messages: [], files: [] };
}

function load(): Room {
  if (typeof localStorage === "undefined") return blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Room;
    return {
      channels: parsed.channels ?? [],
      messages: parsed.messages ?? [],
      files: parsed.files ?? [],
    };
  } catch {
    return blank();
  }
}

function save(room: Room) {
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(room));
}

export const projectRoomStore = {
  channels(projectId: string) {
    return load().channels.filter((c) => c.project_id === projectId);
  },
  messages(channelId: string) {
    return load()
      .messages.filter((m) => m.channel_id === channelId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  files(projectId: string) {
    return load()
      .files.filter((f) => f.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  addChannel(input: { org_id: string; project_id: string; name: string; created_by: string | null }) {
    const room = load();
    const row: ProjectChannel = {
      id: uuid(),
      org_id: input.org_id,
      project_id: input.project_id,
      name: input.name.trim().toLowerCase().replace(/\s+/g, "-"),
      created_by: input.created_by,
      created_at: nowIso(),
    };
    room.channels.push(row);
    save(room);
    return row;
  },
  addMessage(input: Omit<ProjectMessage, "id" | "created_at">) {
    const room = load();
    const row: ProjectMessage = { ...input, id: uuid(), created_at: nowIso() };
    room.messages.push(row);
    save(room);
    return row;
  },
  addFile(input: Omit<ProjectFile, "id" | "created_at">) {
    const room = load();
    const row: ProjectFile = { ...input, id: uuid(), created_at: nowIso() };
    room.files.push(row);
    save(room);
    return row;
  },
};
