import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * When Supabase env vars are present we create a real client; otherwise the app
 * runs in local mock mode (see src/lib/store.ts). This lets the pilot team click
 * around a fully seeded demo without provisioning any backend first.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isMockMode = supabase === null;
