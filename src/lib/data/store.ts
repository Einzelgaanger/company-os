import { buildSeed, DEMO_USER_ID, type SeedData } from "./seed";

/** Bump when seed shape changes so browsers reseed (drops prior local mock). */
export const DB_KEY = "loop.db.v5"; // v5: heavy demo seed (dense projects/commitments/queues)
const SESSION_KEY = "loop.session.v1";

type TableName = keyof SeedData;

function load(): SeedData {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as SeedData;
      } catch {
        // fall through to reseed
      }
    }
  }
  const seed = buildSeed();
  persist(seed);
  return seed;
}

function persist(data: SeedData) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }
}

let data: SeedData = load();

export const store = {
  all<T extends TableName>(table: T): SeedData[T] {
    return data[table];
  },
  set<T extends TableName>(table: T, rows: SeedData[T]) {
    data[table] = rows;
    persist(data);
  },
  reset() {
    data = buildSeed();
    persist(data);
  },
  raw(): SeedData {
    return data;
  },
};

// --- Session (mock auth) ---------------------------------------------------

export interface Session {
  userId: string;
}

export function getStoredSession(): Session | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setStoredSession(session: Session | null) {
  if (typeof localStorage === "undefined") return;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export const DEMO_SESSION: Session = { userId: DEMO_USER_ID };
