import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql as dsql } from "drizzle-orm";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.js";

export type TenantDb = PostgresJsDatabase<typeof schema>;

type TenantDbOpts = {
  replica?: boolean;
};

type PoolEntry = {
  sql: Sql;
  db: TenantDb;
};

/**
 * Per-connection pools keyed by connection URL.
 * Intentionally NOT a global app-facing `db` singleton — callers must go through
 * getTenantDb / withTenantContext so silo routing stays a data move, not a rewrite.
 */
const pools = new Map<string, PoolEntry>();

function resolveConnectionUrl(tenantId: string, opts?: TenantDbOpts): string {
  void tenantId;
  if (opts?.replica) {
    return (
      process.env.DATABASE_REPLICA_URL ??
      process.env.DATABASE_URL ??
      "postgres://loop_app:loop@127.0.0.1:5433/loop"
    );
  }
  return (
    process.env.DATABASE_URL ?? "postgres://loop_app:loop@127.0.0.1:5433/loop"
  );
}

function getPool(url: string): PoolEntry {
  let entry = pools.get(url);
  if (!entry) {
    const client = postgres(url, { max: 10 });
    const db = drizzle(client, { schema });
    entry = { sql: client, db };
    pools.set(url, entry);
  }
  return entry;
}

/**
 * Resolve a Drizzle client for a tenant (pooled or silo).
 * Does NOT set tenant RLS context — use withTenantContext for queries.
 */
export async function getTenantDb(
  tenantId: string,
  opts?: TenantDbOpts,
): Promise<TenantDb> {
  if (!tenantId) {
    throw new Error("getTenantDb: tenantId is required");
  }
  const url = resolveConnectionUrl(tenantId, opts);
  return getPool(url).db;
}

/**
 * Run `fn` inside a transaction with transaction-scoped tenant RLS context.
 *
 * ALWAYS uses set_config(..., true) — never plain SET.
 * Uses Drizzle's own transaction so the tx handle is a real PostgresJsDatabase
 * (wrapping postgres.js TransactionSql via drizzle(tx) hits a parsers crash).
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("withTenantContext: tenantId is required");
  }

  const url = resolveConnectionUrl(tenantId);
  const { db } = getPool(url);

  return db.transaction(async (tx) => {
    // true = is_local → transaction-scoped (RLS footgun #2)
    await tx.execute(
      dsql`select set_config('app.current_tenant_id', ${tenantId}, true)`,
    );
    return fn(tx as unknown as TenantDb);
  });
}
