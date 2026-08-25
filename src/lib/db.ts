import { isMockMode } from "./supabase";
import { mockDb } from "./data/db.mock";
import { supabaseDb } from "./data/db.supabase";
import { apiDb } from "./data/db.api";
import { apiConfigured } from "./api";

/**
 * Data plane selection:
 * - VITE_API_URL → Fastify API (required in production unless VITE_ALLOW_MOCK=1)
 * - else Supabase when configured (legacy)
 * - else mock — DEV/test, or production only with VITE_ALLOW_MOCK=1
 */
function resolveDb(): typeof mockDb {
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
      "[loop] Production build refuses the mock data plane. Set VITE_API_URL to the Fastify API (or VITE_ALLOW_MOCK=1 for a demo-only host).",
    );
  }

  if (!isMockMode) return supabaseDb as unknown as typeof mockDb;
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
