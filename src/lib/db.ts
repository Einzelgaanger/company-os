import { isMockMode } from "./supabase";
import { mockDb } from "./data/db.mock";
import { supabaseDb } from "./data/db.supabase";
import { apiDb } from "./data/db.api";
import { apiConfigured } from "./api";

/**
 * Data plane selection:
 * - Supabase when configured (Company OS production on Render)
 * - else VITE_API_URL → optional local Fastify (@loop/api)
 * - else mock — DEV/test, or production only with VITE_ALLOW_MOCK=1
 */
function resolveDb(): typeof mockDb {
  // Prefer Supabase whenever configured so a stray VITE_API_URL cannot hijack prod.
  if (!isMockMode) return supabaseDb as unknown as typeof mockDb;
  if (apiConfigured()) return apiDb as unknown as typeof mockDb;

  const allowMock =
    import.meta.env.DEV ||
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_ALLOW_MOCK === "1" ||
    Boolean(
      typeof window !== "undefined" &&
        (window as { __LOOP_ALLOW_MOCK__?: boolean }).__LOOP_ALLOW_MOCK__,
    );

  if (import.meta.env.PROD && !allowMock) {
    throw new Error(
      "[loop] Production build requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, VITE_API_URL, or VITE_ALLOW_MOCK=1 for demo-only hosts.",
    );
  }

  return mockDb;
}

export const db = resolveDb();

export {
  scopedUserIds,
  canAccess,
  visibleCommitments,
  governanceStats,
  commitmentHealth,
  projectHealth,
  PRIORITY_RANK,
  type GovernanceStats,
  type Health,
} from "./data/db.mock";

export type { CommitmentStatus, Priority } from "./types";
