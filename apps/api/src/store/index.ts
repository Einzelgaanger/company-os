/**
 * Store facade — Postgres when DATABASE_URL is set (and LOOP_MEMORY_STORE≠1).
 * Memory remains only for vitest / explicit LOOP_MEMORY_STORE=1.
 */
const useMemory =
  process.env.LOOP_MEMORY_STORE === "1" ||
  (process.env.NODE_ENV === "test" && !process.env.DATABASE_URL);

export const storeMode: "memory" | "postgres" = useMemory ? "memory" : "postgres";

if (storeMode === "postgres" && !process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "storeMode=postgres but DATABASE_URL is unset. Set DATABASE_URL or LOOP_MEMORY_STORE=1.",
  );
}

export * from "./memory.js";
